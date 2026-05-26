import type { RequestBaseConfig } from "../utils/request.js";

import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import StoryblokClient from "storyblok-js-client";

import { mapWithConcurrency } from "../../utils/async-utils.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

import { getAllStories, getStoryBySlug } from "./stories.js";

const DEFAULT_LANGUAGE = "[default]";
const DELIVERY_CHECK_CONCURRENCY = 5;
const DELIVERY_API_DEFAULT_RATE_LIMIT = 5;
const DELIVERY_API_MAX_RETRIES = 10;
const DELIVERY_API_TIMEOUT_SECONDS = 60;

export type LanguagePublishState =
    | "published_clean"
    | "published_with_unpublished_changes"
    | "draft_never_published"
    | "unpublished_historical"
    | "draft_or_unpublished"
    | "missing"
    | "published_unknown"
    | "error";

export interface BuildLanguagePublishStateMapArgs {
    from: string;
    accessToken?: string;
    languages?: string;
    startsWith?: string;
    withSlug?: string[];
    fileName?: string;
    outputPath?: string;
}

export interface BuildLanguagePublishStateMapFromStoriesArgs {
    from: string;
    stories: any[];
    languages: string[];
    accessToken?: string;
}

export interface LanguagePublishStateMapEntry {
    id?: number | string;
    uuid?: string;
    name?: string;
    fullSlug?: string;
    languages?: Record<
        string,
        {
            state?: LanguagePublishState;
            [key: string]: unknown;
        }
    >;
    cleanPublishedLanguages?: string[];
    [key: string]: unknown;
}

export interface LanguagePublishStateMap {
    generatedAt?: string;
    source?: {
        spaceId?: string;
        startsWith?: string | null;
        withSlug?: string[] | null;
    };
    languages?: string[];
    storyCount?: number;
    statesByLanguage?: Record<string, Record<string, number>>;
    stories?: Record<string, LanguagePublishStateMapEntry>;
}

interface DeliveryCheck {
    status: number;
    ok: boolean;
    fullSlug: string | null;
    publishedAt: string | null;
    contentHash: string | null;
    errorMessage?: string | null;
}

export const createStatusPreservingFetch =
    (baseFetch: typeof fetch = fetch): typeof fetch =>
    async (input, init) => {
        const response = await baseFetch(input, init);

        if (response.ok) {
            return response;
        }

        const responseText = await response
            .clone()
            .text()
            .catch(() => "");

        if (responseText.trim().length === 0) {
            return new Response("{}", {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }

        try {
            JSON.parse(responseText);
            return response;
        } catch {
            return new Response(JSON.stringify({ error: responseText }), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }
    };

const createDeliveryClient = ({
    accessToken,
    deliveryApiUrl,
    rateLimit,
}: {
    accessToken: string;
    deliveryApiUrl: string;
    rateLimit?: number;
}) =>
    new StoryblokClient(
        {
            accessToken,
            rateLimit: rateLimit ?? DELIVERY_API_DEFAULT_RATE_LIMIT,
            maxRetries: DELIVERY_API_MAX_RETRIES,
            timeout: DELIVERY_API_TIMEOUT_SECONDS,
            fetch: createStatusPreservingFetch(),
            cache: {
                clear: "auto",
                type: "none",
            },
        },
        deliveryApiUrl,
    );

const resolveStoryblokErrorStatus = (error: any): number =>
    error?.status ??
    error?.response?.status ??
    error?.response?.response?.status ??
    error?.response?.data?.status ??
    error?.message?.status ??
    error?.message?.response?.status ??
    error?.message?.response?.response?.status ??
    error?.message?.response?.data?.status ??
    0;

const resolveStoryblokErrorMessage = (error: any): string | null => {
    const responseData = error?.response?.data;

    if (Array.isArray(responseData)) {
        return responseData.filter(Boolean).join(", ") || null;
    }

    if (typeof responseData === "string") {
        return responseData;
    }

    if (responseData && typeof responseData === "object") {
        return (
            responseData.error ||
            responseData.message ||
            error?.response?.message ||
            error?.message?.message ||
            error?.message ||
            null
        );
    }

    if (error?.message && typeof error.message === "object") {
        return (
            error.message.message ||
            error.message.response?.message ||
            error.message.response?.data?.error ||
            null
        );
    }

    return error?.message || null;
};

const isStoryblokNotFoundMessage = (message: string | null): boolean => {
    const normalized = message?.trim().toLowerCase();

    return (
        normalized === "not found" ||
        normalized === "this record could not be found"
    );
};

const cleanStoryblokContent = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(cleanStoryblokContent);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .filter((key) => key !== "_editable")
                .sort()
                .map((key) => [key, cleanStoryblokContent(value[key])]),
        );
    }

    return value;
};

const hashContent = (value: any): string =>
    createHash("sha256")
        .update(JSON.stringify(cleanStoryblokContent(value)))
        .digest("hex");

const normalizeLanguages = (
    languages: string | undefined,
): string[] | "all" => {
    if (!languages || languages.trim().length === 0) {
        return "all";
    }

    if (languages.trim().toLowerCase() === "all") {
        return "all";
    }

    const normalized = languages
        .split(",")
        .map((language) => language.trim())
        .filter(Boolean)
        .map((language) =>
            language.toLowerCase() === "default" ? DEFAULT_LANGUAGE : language,
        );

    return Array.from(new Set(normalized));
};

const readSpaceLanguageCodes = (spaceResponse: any): string[] => {
    const space = spaceResponse?.data?.space || spaceResponse?.space || {};
    const languages = space.languages;

    if (!Array.isArray(languages)) {
        return [];
    }

    return languages
        .map((language) =>
            typeof language === "string" ? language : language?.code,
        )
        .filter((language): language is string => Boolean(language));
};

const resolveLanguages = async (
    languages: string | undefined,
    config: RequestBaseConfig,
): Promise<string[]> => {
    const normalized = normalizeLanguages(languages);

    if (normalized !== "all") {
        return normalized;
    }

    const response = await config.sbApi.get(`spaces/${config.spaceId}`);
    return [DEFAULT_LANGUAGE, ...readSpaceLanguageCodes(response)];
};

const classifyDefaultLanguageState = (story: any): LanguagePublishState => {
    if (story?.published === true && story?.unpublished_changes === false) {
        return "published_clean";
    }

    if (story?.published === true && story?.unpublished_changes === true) {
        return "published_with_unpublished_changes";
    }

    if (story?.published === false && story?.published_at) {
        return "unpublished_historical";
    }

    if (story?.published === false) {
        return "draft_never_published";
    }

    return "published_unknown";
};

const classifyTranslatedLanguageState = ({
    published,
    draft,
}: {
    published: DeliveryCheck;
    draft: DeliveryCheck;
}): LanguagePublishState => {
    if (published.status === 200 && draft.status === 200) {
        if (!published.contentHash || !draft.contentHash) {
            return "published_unknown";
        }

        return published.contentHash === draft.contentHash
            ? "published_clean"
            : "published_with_unpublished_changes";
    }

    if (published.status === 404 && draft.status === 200) {
        return "draft_or_unpublished";
    }

    if (published.status === 404 && draft.status === 404) {
        return "missing";
    }

    if (published.status === 200) {
        return "published_unknown";
    }

    return "error";
};

const fetchDeliveryStory = async ({
    deliveryClient,
    slug,
    version,
    language,
}: {
    deliveryClient: Pick<StoryblokClient, "get">;
    slug: string;
    version: "published" | "draft";
    language?: string;
}): Promise<DeliveryCheck> => {
    const params: Record<string, string> = {
        version,
        cv: String(Date.now()),
    };

    if (language && language !== DEFAULT_LANGUAGE) {
        params.language = language;
    }

    try {
        const response = await deliveryClient.get(
            `cdn/stories/${slug}`,
            params,
        );
        const story = response?.data?.story;

        return {
            status: 200,
            ok: true,
            fullSlug: story?.full_slug || null,
            publishedAt: story?.published_at || null,
            contentHash: story?.content ? hashContent(story.content) : null,
        };
    } catch (error: any) {
        const errorMessage = resolveStoryblokErrorMessage(error);
        const status =
            resolveStoryblokErrorStatus(error) ||
            (isStoryblokNotFoundMessage(errorMessage) ? 404 : 0);
        const story = error?.response?.data?.story;

        if (status === 429) {
            throw new Error(
                `Storyblok Delivery API rate limit did not recover after retries for '${slug}' (${version}${language ? `, ${language}` : ""}).`,
            );
        }

        if (status === 0) {
            throw new Error(
                `Storyblok Delivery API request failed without an HTTP status for '${slug}' (${version}${language ? `, ${language}` : ""})${errorMessage ? `: ${errorMessage}` : "."}`,
            );
        }

        return {
            status,
            ok: false,
            fullSlug: story?.full_slug || null,
            publishedAt: story?.published_at || null,
            contentHash: story?.content ? hashContent(story.content) : null,
            errorMessage,
        };
    }
};

const loadStoriesForLanguageState = async (
    {
        startsWith,
        withSlug,
    }: {
        startsWith?: string;
        withSlug?: string[];
    },
    config: RequestBaseConfig,
) => {
    if (withSlug && withSlug.length > 0) {
        const stories = await Promise.all(
            withSlug.map((slug) => getStoryBySlug(slug, config)),
        );

        return stories.filter(Boolean);
    }

    if (startsWith) {
        return getAllStories(
            { options: { starts_with: startsWith } as any },
            config,
        );
    }

    return getAllStories({}, config);
};

export const loadLanguagePublishStateMap = (
    languagePublishStatePath: string,
): LanguagePublishStateMap => {
    const resolvedPath = path.isAbsolute(languagePublishStatePath)
        ? languagePublishStatePath
        : path.resolve(process.cwd(), languagePublishStatePath);

    const fileContent = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(fileContent) as LanguagePublishStateMap;

    if (!parsed || typeof parsed !== "object" || !parsed.stories) {
        throw new Error(
            `Language publish-state file '${languagePublishStatePath}' is missing a stories map.`,
        );
    }

    return parsed;
};

export const buildLanguagePublishStateMap = async (
    args: BuildLanguagePublishStateMapArgs,
    config: RequestBaseConfig,
) => {
    const accessToken = args.accessToken || config.accessToken;

    if (!args.from) {
        throw new Error("--from is required.");
    }

    const sourceConfig = { ...config, spaceId: args.from };
    const deliveryApiUrl =
        config.storyblokDeliveryApiUrl || "https://api.storyblok.com/v2";
    const languages = await resolveLanguages(args.languages, sourceConfig);
    const uniqueLanguages = Array.from(new Set(languages));

    if (
        uniqueLanguages.some((language) => language !== DEFAULT_LANGUAGE) &&
        !accessToken
    ) {
        throw new Error(
            "--accessToken is required when config accessToken is empty and translated language state is requested.",
        );
    }
    const stories = (
        await loadStoriesForLanguageState(
            {
                startsWith: args.startsWith,
                withSlug: args.withSlug,
            },
            sourceConfig,
        )
    ).filter((item: any) => item?.story && item.story.is_folder !== true);

    Logger.success(
        `Fetched ${stories.length} source stories from space '${args.from}'.`,
    );

    const result = await buildLanguagePublishStateMapFromStories(
        {
            from: args.from,
            stories,
            languages: uniqueLanguages,
            accessToken,
        },
        {
            ...config,
            storyblokDeliveryApiUrl: deliveryApiUrl,
        },
    );

    result.source = {
        ...result.source,
        startsWith: args.startsWith || null,
        withSlug: args.withSlug || null,
    };

    await createAndSaveToFile(
        {
            ext: "json",
            datestamp: !args.fileName && !args.outputPath,
            filename:
                args.fileName || `${args.from}---language-publish-state-map`,
            folder: "language-publish-state",
            path: args.outputPath,
            res: result,
        },
        config,
    );

    Logger.success(
        `Language publish-state map created for ${result.storyCount ?? 0} stories.`,
    );

    return result;
};

export const buildLanguagePublishStateMapFromStories = async (
    args: BuildLanguagePublishStateMapFromStoriesArgs,
    config: RequestBaseConfig,
): Promise<LanguagePublishStateMap> => {
    const accessToken = args.accessToken || config.accessToken;

    if (!args.from) {
        throw new Error("--from is required.");
    }

    const needsDeliveryApi = args.languages.some(
        (language) => language !== DEFAULT_LANGUAGE,
    );

    if (needsDeliveryApi && !accessToken) {
        throw new Error(
            "A Delivery API access token is required to resolve translated language publication state.",
        );
    }

    const deliveryAccessToken = accessToken || "";
    const deliveryApiUrl =
        config.storyblokDeliveryApiUrl || "https://api.storyblok.com/v2";
    const uniqueLanguages = Array.from(new Set(args.languages));
    const translatedLanguages = uniqueLanguages.filter(
        (language) => language !== DEFAULT_LANGUAGE,
    );
    const stories = args.stories.filter(
        (item: any) => item?.story && item.story.is_folder !== true,
    );
    const deliveryClient = needsDeliveryApi
        ? createDeliveryClient({
              accessToken: deliveryAccessToken,
              deliveryApiUrl,
              rateLimit: config.rateLimit,
          })
        : null;
    const totalDeliveryChecks = stories.length * translatedLanguages.length * 2;

    if (needsDeliveryApi) {
        Logger.log(
            `Resolving translated language publish state for ${stories.length} stories and ${translatedLanguages.length} language(s). Up to ${totalDeliveryChecks} Delivery API check(s) will run through StoryblokClient at ${config.rateLimit ?? DELIVERY_API_DEFAULT_RATE_LIMIT} req/s.`,
        );
    }

    let processedStories = 0;

    const storyEntries = await mapWithConcurrency(
        stories,
        DELIVERY_CHECK_CONCURRENCY,
        async (item: any) => {
            const story = item.story;
            const languagesByCode: Record<string, any> = {};

            for (const language of uniqueLanguages) {
                if (language === DEFAULT_LANGUAGE) {
                    languagesByCode[language] = {
                        state: classifyDefaultLanguageState(story),
                        source: "management",
                        published: story.published,
                        unpublishedChanges: story.unpublished_changes,
                        publishedAt: story.published_at || null,
                        firstPublishedAt: story.first_published_at || null,
                    };
                    continue;
                }

                const [published, draft] = await Promise.all([
                    fetchDeliveryStory({
                        deliveryClient: deliveryClient as StoryblokClient,
                        slug: story.full_slug,
                        version: "published",
                        language,
                    }),
                    fetchDeliveryStory({
                        deliveryClient: deliveryClient as StoryblokClient,
                        slug: story.full_slug,
                        version: "draft",
                        language,
                    }),
                ]);

                languagesByCode[language] = {
                    state: classifyTranslatedLanguageState({
                        published,
                        draft,
                    }),
                    source: "delivery",
                    published,
                    draft,
                };
            }

            const storyEntry = {
                id: story.id,
                uuid: story.uuid,
                name: story.name,
                fullSlug: story.full_slug,
                languages: languagesByCode,
                cleanPublishedLanguages: Object.entries(languagesByCode)
                    .filter(
                        ([, value]: any) => value.state === "published_clean",
                    )
                    .map(([language]) => language),
            };

            processedStories++;
            if (
                needsDeliveryApi &&
                (processedStories % 10 === 0 ||
                    processedStories === stories.length)
            ) {
                Logger.success(
                    `Resolved translated language publish state for ${processedStories}/${stories.length} stories.`,
                );
            }

            return storyEntry;
        },
    );

    return {
        generatedAt: new Date().toISOString(),
        source: {
            spaceId: args.from,
            startsWith: null,
            withSlug: null,
        },
        languages: uniqueLanguages,
        storyCount: storyEntries.length,
        statesByLanguage: uniqueLanguages.reduce<Record<string, any>>(
            (acc, language) => {
                acc[language] = storyEntries.reduce<Record<string, number>>(
                    (stateAcc, story) => {
                        const state =
                            story.languages?.[language]?.state || "missing";
                        stateAcc[state] = (stateAcc[state] || 0) + 1;
                        return stateAcc;
                    },
                    {},
                );
                return acc;
            },
            {},
        ),
        stories: Object.fromEntries(
            storyEntries.map((story) => [story.fullSlug, story]),
        ),
    };
};
