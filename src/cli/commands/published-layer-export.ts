import type { CLIOptions } from "../../utils/interfaces.js";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import { managementApi } from "../../api/managementApi.js";
import { mapWithConcurrency } from "../../utils/async-utils.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";

const STORY_VERSION_FETCH_CONCURRENCY = 5;

const asNumber = (value: unknown, fallback: number) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }

    return fallback;
};

const toArray = (value: string | string[] | undefined) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

const sanitizeFilePart = (value: string) =>
    value
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);

const stableStringify = (value: unknown): string =>
    JSON.stringify(value, (_key, child) => {
        if (child && typeof child === "object" && !Array.isArray(child)) {
            return Object.keys(child)
                .sort()
                .reduce<Record<string, unknown>>((acc, key) => {
                    acc[key] = child[key];
                    return acc;
                }, {});
        }

        return child;
    });

const contentHash = (value: unknown) =>
    crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

const valueKind = (value: unknown) => {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
};

const collectPaths = (
    value: unknown,
    prefix = "",
    paths = new Map<string, string>(),
) => {
    paths.set(prefix || "<root>", valueKind(value));

    if (Array.isArray(value)) {
        value.forEach((item) => collectPaths(item, `${prefix}[]`, paths));
        return paths;
    }

    if (value && typeof value === "object") {
        Object.entries(value as Record<string, unknown>).forEach(
            ([key, child]) => {
                collectPaths(child, prefix ? `${prefix}.${key}` : key, paths);
            },
        );
    }

    return paths;
};

const collectMatchingKeys = (
    value: unknown,
    matcher: (key: string) => boolean,
    keys: string[] = [],
) => {
    if (Array.isArray(value)) {
        value.forEach((item) => collectMatchingKeys(item, matcher, keys));
        return keys;
    }

    if (value && typeof value === "object") {
        Object.entries(value as Record<string, unknown>).forEach(
            ([key, child]) => {
                if (matcher(key)) keys.push(key);
                collectMatchingKeys(child, matcher, keys);
            },
        );
    }

    return keys;
};

const compareContentShape = (
    draftContent: unknown,
    publishedContent: unknown,
) => {
    const draftPaths = collectPaths(draftContent);
    const publishedPaths = collectPaths(publishedContent);
    const missingFromPublished = [...draftPaths.keys()].filter(
        (key) => !publishedPaths.has(key),
    );
    const onlyInPublished = [...publishedPaths.keys()].filter(
        (key) => !draftPaths.has(key),
    );
    const typeDiffs = [...draftPaths.keys()].filter(
        (key) =>
            publishedPaths.has(key) &&
            draftPaths.get(key) !== publishedPaths.get(key),
    );

    return {
        draftPathCount: draftPaths.size,
        publishedPathCount: publishedPaths.size,
        missingFromPublishedCount: missingFromPublished.length,
        onlyInPublishedCount: onlyInPublished.length,
        typeDiffCount: typeDiffs.length,
        missingFromPublishedSamples: missingFromPublished.slice(0, 20),
        onlyInPublishedSamples: onlyInPublished.slice(0, 20),
        typeDiffSamples: typeDiffs.slice(0, 20),
    };
};

const buildBaseName = ({
    fileName,
    storyId,
    startsWith,
    withSlug,
    all,
}: {
    fileName?: string;
    storyId: string[];
    startsWith?: string;
    withSlug: string[];
    all?: boolean;
}) => {
    if (fileName) return sanitizeFilePart(fileName);
    if (storyId.length === 1)
        return `story-${sanitizeFilePart(storyId[0] ?? "id")}`;
    if (storyId.length > 1) return "selected-story-ids";
    if (startsWith) return `starts-with-${sanitizeFilePart(startsWith)}`;
    if (withSlug.length === 1)
        return `slug-${sanitizeFilePart(withSlug[0] ?? "story")}`;
    if (withSlug.length > 1) return "selected-slugs";
    if (all) return "all";
    return "stories";
};

const writeJson = async (
    outputDir: string,
    filename: string,
    payload: unknown,
) => {
    const absoluteDir = path.isAbsolute(outputDir)
        ? outputDir
        : path.join(process.cwd(), outputDir);
    const absolutePath = path.join(absoluteDir, filename);

    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, {
        flag: "w",
    });

    return absolutePath;
};

const getStoriesForExport = async ({
    from,
    all,
    storyId,
    startsWith,
    withSlug,
}: {
    from: string;
    all?: boolean;
    storyId: string[];
    startsWith?: string;
    withSlug: string[];
}) => {
    const config = { ...apiConfig, spaceId: from };

    if (storyId.length > 0) {
        const stories = await Promise.all(
            storyId.map((id) => managementApi.stories.getStoryById(id, config)),
        );

        return stories
            .filter(Boolean)
            .filter((item: any) => !item.story?.is_folder);
    }

    if (withSlug.length > 0) {
        const stories = await Promise.all(
            withSlug.map((slug) =>
                managementApi.stories.getStoryBySlug(slug, config),
            ),
        );

        return stories
            .filter(Boolean)
            .filter((item: any) => !item.story?.is_folder);
    }

    if (startsWith) {
        const stories = await managementApi.stories.getAllStories(
            { options: { starts_with: startsWith } as any },
            config,
        );

        return stories.filter((item: any) => !item.story?.is_folder);
    }

    if (all) {
        const stories = await managementApi.stories.getAllStories({}, config);
        return stories.filter((item: any) => !item.story?.is_folder);
    }

    return [];
};

const getStoryVersionsPages = async ({
    storyId,
    from,
    versionsPerPage,
    maxVersionPages,
}: {
    storyId: string;
    from: string;
    versionsPerPage: number;
    maxVersionPages: number;
}) => {
    const config = { ...apiConfig, spaceId: from };
    const versions: any[] = [];

    for (let page = 1; page <= maxVersionPages; page++) {
        const response = await managementApi.stories.getStoryVersions(
            {
                storyId,
                showContent: true,
                page,
                perPage: versionsPerPage,
            },
            config,
        );
        const pageVersions = Array.isArray(response?.story_versions)
            ? response.story_versions
            : [];

        versions.push(...pageVersions);

        if (
            pageVersions.some(
                (version: any) => version.status === "published",
            ) ||
            pageVersions.length < versionsPerPage
        ) {
            break;
        }
    }

    return versions;
};

const selectLatestPublishedVersion = (versions: any[]) =>
    versions
        .filter((version) => version.status === "published")
        .sort(
            (a, b) =>
                new Date(b.created_at ?? 0).getTime() -
                new Date(a.created_at ?? 0).getTime(),
        )[0];

export const publishedLayerExport = async ({ flags }: CLIOptions) => {
    const from = flags["from"] as string | undefined;
    const storyId = toArray(flags["storyId"] as string | string[] | undefined);
    const withSlug = toArray(
        flags["withSlug"] as string | string[] | undefined,
    );
    const startsWith = flags["startsWith"] as string | undefined;
    const all = flags["all"] as boolean | undefined;
    const outputPath =
        (flags["outputPath"] as string | undefined) ??
        "sbmig/published-layer-export";
    const fileName = flags["fileName"] as string | undefined;
    const versionsPerPage = asNumber(flags["versionsPerPage"], 25);
    const maxVersionPages = asNumber(flags["maxVersionPages"], 4);

    if (!from) {
        Logger.error("--from is required.");
        process.exitCode = 1;
        return;
    }

    if (!all && !startsWith && withSlug.length === 0 && storyId.length === 0) {
        Logger.error(
            "Pass one of --all, --storyId, --startsWith, or --withSlug.",
        );
        process.exitCode = 1;
        return;
    }

    Logger.log(
        `Exporting draft/current and published layers from space ${from}.`,
    );

    const draftCurrentStories = await getStoriesForExport({
        from,
        all,
        storyId,
        startsWith,
        withSlug,
    });

    if (storyId.length > 0 || withSlug.length > 0) {
        const requestedCount = storyId.length + withSlug.length;

        if (draftCurrentStories.length !== requestedCount) {
            Logger.error(
                `Resolved ${draftCurrentStories.length} story/stories from ${requestedCount} requested identifier(s).`,
            );

            if (withSlug.length > 0) {
                Logger.warning(
                    "If a slug did not resolve, verify the exact Storyblok full_slug or retry with --storyId.",
                );
            }

            process.exitCode = 1;
            return;
        }
    }

    Logger.success(
        `Fetched ${draftCurrentStories.length} draft/current stories.`,
    );

    const layerResults = await mapWithConcurrency(
        draftCurrentStories,
        STORY_VERSION_FETCH_CONCURRENCY,
        async (item: any) => {
            const story = item.story;
            const versions = await getStoryVersionsPages({
                storyId: String(story.id),
                from,
                versionsPerPage,
                maxVersionPages,
            });
            const publishedVersion = selectLatestPublishedVersion(versions);
            const publishedLayerStory = publishedVersion
                ? {
                      story: {
                          ...story,
                          content: publishedVersion.content,
                      },
                  }
                : null;
            const i18nKeys = [
                ...new Set(
                    collectMatchingKeys(story.content, (key) =>
                        key.includes("__i18n__"),
                    ),
                ),
            ].sort();

            return {
                draftCurrent: item,
                publishedLayer: publishedLayerStory,
                summary: {
                    id: story.id,
                    name: story.name,
                    slug: story.slug,
                    full_slug: story.full_slug,
                    published: story.published,
                    unpublished_changes: story.unpublished_changes,
                    current_version_id: story.current_version_id,
                    updated_at: story.updated_at,
                    published_at: story.published_at,
                    draftCurrentContentHash: contentHash(story.content),
                    latestPublishedVersion: publishedVersion
                        ? {
                              id: publishedVersion.id,
                              status: publishedVersion.status,
                              created_at: publishedVersion.created_at,
                              contentHash: contentHash(
                                  publishedVersion.content,
                              ),
                          }
                        : null,
                    fetchedVersionCount: versions.length,
                    fetchedVersionStatuses: [
                        ...new Set(versions.map((version) => version.status)),
                    ],
                    i18nKeyCount: i18nKeys.length,
                    i18nKeySamples: i18nKeys.slice(0, 20),
                    shapeComparison: publishedVersion
                        ? compareContentShape(
                              story.content,
                              publishedVersion.content,
                          )
                        : null,
                },
            };
        },
    );

    const publishedLayerStories = layerResults
        .map((result) => result.publishedLayer)
        .filter(Boolean);
    const baseName = buildBaseName({
        fileName,
        storyId,
        startsWith,
        withSlug,
        all,
    });
    const draftFile = `${baseName}---draft-current-full.json`;
    const publishedFile = `${baseName}---published-layer-full.json`;
    const summaryFile = `${baseName}---dual-layer-summary.json`;

    const writtenDraftPath = await writeJson(
        outputPath,
        draftFile,
        draftCurrentStories,
    );
    const writtenPublishedPath = await writeJson(
        outputPath,
        publishedFile,
        publishedLayerStories,
    );
    const writtenSummaryPath = await writeJson(outputPath, summaryFile, {
        generatedAt: new Date().toISOString(),
        source: {
            from,
            all: Boolean(all),
            storyId,
            startsWith: startsWith ?? null,
            withSlug,
            versionsPerPage,
            maxVersionPages,
        },
        counts: {
            draftCurrentStories: draftCurrentStories.length,
            publishedLayerStories: publishedLayerStories.length,
            withoutPublishedLayer:
                draftCurrentStories.length - publishedLayerStories.length,
        },
        files: {
            draftCurrentFull: writtenDraftPath,
            publishedLayerFull: writtenPublishedPath,
            summary: summaryFile,
        },
        stories: layerResults.map((result) => result.summary),
    });

    Logger.success(`Wrote draft/current layer to ${writtenDraftPath}`);
    Logger.success(`Wrote published layer to ${writtenPublishedPath}`);
    Logger.success(`Wrote dual-layer summary to ${writtenSummaryPath}`);
};
