import type { RequestBaseConfig } from "../utils/request.js";

import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import { mapWithConcurrency } from "../../utils/async-utils.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

import { getAllStories, getStoryBySlug } from "./stories.js";

const DEFAULT_LANGUAGE = "[default]";
const DELIVERY_CHECK_CONCURRENCY = 5;

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
}

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
    deliveryApiUrl,
    accessToken,
    slug,
    version,
    language,
}: {
    deliveryApiUrl: string;
    accessToken: string;
    slug: string;
    version: "published" | "draft";
    language?: string;
}): Promise<DeliveryCheck> => {
    const url = new URL(
        `${deliveryApiUrl.replace(/\/$/, "")}/cdn/stories/${slug}`,
    );
    url.searchParams.set("token", accessToken);
    url.searchParams.set("version", version);
    url.searchParams.set("cv", String(Date.now()));

    if (language && language !== DEFAULT_LANGUAGE) {
        url.searchParams.set("language", language);
    }

    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    const story = data?.story;

    return {
        status: response.status,
        ok: response.ok,
        fullSlug: story?.full_slug || null,
        publishedAt: story?.published_at || null,
        contentHash: story?.content ? hashContent(story.content) : null,
    };
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

    if (!accessToken) {
        throw new Error(
            "--accessToken is required when config accessToken is empty.",
        );
    }

    const sourceConfig = { ...config, spaceId: args.from };
    const deliveryApiUrl =
        config.storyblokDeliveryApiUrl || "https://api.storyblok.com/v2";
    const languages = await resolveLanguages(args.languages, sourceConfig);
    const uniqueLanguages = Array.from(new Set(languages));
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
                        deliveryApiUrl,
                        accessToken,
                        slug: story.full_slug,
                        version: "published",
                        language,
                    }),
                    fetchDeliveryStory({
                        deliveryApiUrl,
                        accessToken,
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

            return {
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
        },
    );

    const result = {
        generatedAt: new Date().toISOString(),
        source: {
            spaceId: args.from,
            startsWith: args.startsWith || null,
            withSlug: args.withSlug || null,
        },
        languages: uniqueLanguages,
        storyCount: storyEntries.length,
        statesByLanguage: uniqueLanguages.reduce<Record<string, any>>(
            (acc, language) => {
                acc[language] = storyEntries.reduce<Record<string, number>>(
                    (stateAcc, story) => {
                        const state =
                            story.languages[language]?.state || "missing";
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
        `Language publish-state map created for ${storyEntries.length} stories.`,
    );

    return result;
};
