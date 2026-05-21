import type { RequestBaseConfig } from "../utils/request.js";

import crypto from "crypto";

import { mapWithConcurrency } from "../../utils/async-utils.js";
import { managementApi } from "../managementApi.js";

const STORY_VERSION_FETCH_CONCURRENCY = 5;
const DEFAULT_VERSIONS_PER_PAGE = 25;
const DEFAULT_MAX_VERSION_PAGES = 4;

export type StoryLayerState =
    | "draft-only"
    | "clean-published"
    | "dirty-published"
    | "published-unknown";

export interface ContentShapeComparison {
    draftPathCount: number;
    publishedPathCount: number;
    missingFromPublishedCount: number;
    onlyInPublishedCount: number;
    typeDiffCount: number;
    missingFromPublishedSamples: string[];
    onlyInPublishedSamples: string[];
    typeDiffSamples: string[];
}

export interface PublishedLayerVersionSummary {
    id: number | string;
    status: string;
    created_at: string | null;
    contentHash: string;
}

export interface PublishedLayerRecord {
    draftCurrentItem: any;
    publishedLayerItem: any | null;
    storyId: number | string;
    name?: string;
    full_slug?: string;
    state: StoryLayerState;
    selectedPublishedVersion: PublishedLayerVersionSummary | null;
    fetchedVersionCount: number;
    fetchedVersionStatuses: string[];
    draftCurrentContentHash: string;
    shapeComparison: ContentShapeComparison | null;
    missingPublishedLayer: boolean;
}

export interface PublishedLayerContext {
    records: PublishedLayerRecord[];
    publishedLayerInputItems: any[];
    dirtyPublishedRecords: PublishedLayerRecord[];
    missingPublishedLayerRecords: PublishedLayerRecord[];
}

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

export const contentHash = (value: unknown) =>
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

export const compareContentShape = (
    draftContent: unknown,
    publishedContent: unknown,
): ContentShapeComparison => {
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

export const resolveStoryLayerState = (story: any): StoryLayerState => {
    if (story?.published !== true) {
        return "draft-only";
    }

    if (story.unpublished_changes === true) {
        return "dirty-published";
    }

    if (story.unpublished_changes === false) {
        return "clean-published";
    }

    return "published-unknown";
};

export const selectLatestPublishedVersion = (versions: any[]) =>
    versions
        .filter((version) => version.status === "published")
        .sort(
            (a, b) =>
                new Date(b.created_at ?? 0).getTime() -
                new Date(a.created_at ?? 0).getTime(),
        )[0];

export const getStoryVersionsPages = async (
    {
        storyId,
        from,
        versionsPerPage = DEFAULT_VERSIONS_PER_PAGE,
        maxVersionPages = DEFAULT_MAX_VERSION_PAGES,
    }: {
        storyId: string;
        from: string;
        versionsPerPage?: number;
        maxVersionPages?: number;
    },
    config: RequestBaseConfig,
) => {
    const versions: any[] = [];

    for (let page = 1; page <= maxVersionPages; page++) {
        const response = await managementApi.stories.getStoryVersions(
            {
                storyId,
                showContent: true,
                page,
                perPage: versionsPerPage,
            },
            {
                ...config,
                spaceId: from,
            },
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

export const buildPublishedLayerContext = async (
    {
        items,
        from,
    }: {
        items: any[];
        from: string;
    },
    config: RequestBaseConfig,
): Promise<PublishedLayerContext> => {
    const records = await mapWithConcurrency(
        items,
        STORY_VERSION_FETCH_CONCURRENCY,
        async (item: any): Promise<PublishedLayerRecord> => {
            const story = item.story;
            const state = resolveStoryLayerState(story);
            const shouldFetchPublishedLayer = state === "dirty-published";
            const versions = shouldFetchPublishedLayer
                ? await getStoryVersionsPages(
                      {
                          storyId: String(story.id),
                          from,
                      },
                      config,
                  )
                : [];
            const selectedPublishedVersion =
                shouldFetchPublishedLayer && versions.length > 0
                    ? selectLatestPublishedVersion(versions)
                    : null;
            const publishedLayerItem = selectedPublishedVersion
                ? {
                      story: {
                          ...story,
                          content: selectedPublishedVersion.content,
                      },
                  }
                : null;

            return {
                draftCurrentItem: item,
                publishedLayerItem,
                storyId: story.id,
                name: story.name,
                full_slug: story.full_slug,
                state,
                selectedPublishedVersion: selectedPublishedVersion
                    ? {
                          id: selectedPublishedVersion.id,
                          status: selectedPublishedVersion.status,
                          created_at:
                              selectedPublishedVersion.created_at ?? null,
                          contentHash: contentHash(
                              selectedPublishedVersion.content,
                          ),
                      }
                    : null,
                fetchedVersionCount: versions.length,
                fetchedVersionStatuses: [
                    ...new Set(versions.map((version) => version.status)),
                ],
                draftCurrentContentHash: contentHash(story.content),
                shapeComparison: selectedPublishedVersion
                    ? compareContentShape(
                          story.content,
                          selectedPublishedVersion.content,
                      )
                    : null,
                missingPublishedLayer:
                    shouldFetchPublishedLayer && !selectedPublishedVersion,
            };
        },
    );

    return {
        records,
        publishedLayerInputItems: records
            .map((record) => record.publishedLayerItem)
            .filter(Boolean),
        dirtyPublishedRecords: records.filter(
            (record) => record.state === "dirty-published",
        ),
        missingPublishedLayerRecords: records.filter(
            (record) => record.missingPublishedLayer,
        ),
    };
};
