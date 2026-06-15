import type {
    ComponentUsageFilters,
    ComponentUsageMatch,
    ComponentUsageQuery,
    ComponentUsageQueryContext,
    ComponentUsageQueryMatchResult,
    ComponentUsageReport,
    ComponentUsageStoryRef,
    InspectFetchedStoriesArgs,
    InspectStoryblokStoriesArgs,
} from "./component-usage.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { getAllStories, getStoryBySlug } from "../stories/stories.js";

const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isComponentNode = (value: unknown): value is Record<string, any> =>
    isRecord(value) && typeof value.component === "string";

const normalizeStory = (storyData: any): ComponentUsageStoryRef => {
    const story = storyData?.story || storyData || {};

    return story;
};

const storyHasContent = (story: ComponentUsageStoryRef): boolean =>
    isRecord(story.content);

const normalizeMatchDetails = (
    matchResult: ComponentUsageQueryMatchResult,
): Record<string, unknown> | undefined => {
    if (matchResult === true) {
        return undefined;
    }

    if (isRecord(matchResult)) {
        return matchResult;
    }

    return undefined;
};

const createMatch = ({
    node,
    context,
    matchResult,
}: {
    node: Record<string, any>;
    context: ComponentUsageQueryContext;
    matchResult: ComponentUsageQueryMatchResult;
}): ComponentUsageMatch => {
    const details = normalizeMatchDetails(matchResult);
    const match: ComponentUsageMatch = {
        storyId: context.story.id,
        storyName: context.story.name,
        storySlug: context.story.slug,
        storyFullSlug: context.story.full_slug,
        component: node.component,
        uid: typeof node._uid === "string" ? node._uid : undefined,
        path: context.path,
        parentComponent:
            typeof context.parent?.component === "string"
                ? context.parent.component
                : undefined,
        parentUid:
            typeof context.parent?._uid === "string"
                ? context.parent._uid
                : undefined,
    };

    if (details) {
        match.details = details;
    }

    return match;
};

const joinPath = (path: string, segment: string): string =>
    path.length > 0 ? `${path}.${segment}` : segment;

const walkValue = async ({
    value,
    path,
    story,
    parent,
    ancestors,
    query,
    matches,
}: {
    value: unknown;
    path: string;
    story: ComponentUsageStoryRef;
    parent?: Record<string, unknown>;
    ancestors: Array<Record<string, unknown>>;
    query: ComponentUsageQuery;
    matches: ComponentUsageMatch[];
}): Promise<void> => {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            await walkValue({
                value: value[i],
                path: `${path}[${i}]`,
                story,
                parent,
                ancestors,
                query,
                matches,
            });
        }

        return;
    }

    if (!isRecord(value)) {
        return;
    }

    const currentParent = isComponentNode(value) ? value : parent;
    const currentAncestors = isComponentNode(value)
        ? [...ancestors, value]
        : ancestors;

    if (isComponentNode(value)) {
        const context: ComponentUsageQueryContext = {
            story,
            path,
            parent,
            ancestors,
        };
        const matchResult = await query.match(value, context);

        if (matchResult) {
            matches.push(
                createMatch({
                    node: value,
                    context,
                    matchResult,
                }),
            );
        }
    }

    for (const [key, child] of Object.entries(value)) {
        if (key === "_uid" || key === "component") {
            continue;
        }

        await walkValue({
            value: child,
            path: joinPath(path, key),
            story,
            parent: currentParent,
            ancestors: currentAncestors,
            query,
            matches,
        });
    }
};

export const inspectStoryContent = async ({
    story,
    query,
}: {
    story: ComponentUsageStoryRef;
    query: ComponentUsageQuery;
}): Promise<ComponentUsageMatch[]> => {
    const matches: ComponentUsageMatch[] = [];

    if (!storyHasContent(story)) {
        return matches;
    }

    await walkValue({
        value: story.content,
        path: "content",
        story,
        query,
        matches,
        ancestors: [],
    });

    return matches;
};

export const inspectFetchedStories = async ({
    stories,
    query,
    spaceId,
    filters = {},
}: InspectFetchedStoriesArgs): Promise<ComponentUsageReport> => {
    const selectedStories = stories
        .map(normalizeStory)
        .filter((story) => !story.is_folder);
    const matchesByStory = await Promise.all(
        selectedStories.map(async (story) =>
            inspectStoryContent({ story, query }),
        ),
    );
    const matches = matchesByStory.flat();
    const matchedStoryIds = new Set(matches.map((match) => match.storyId));

    return {
        queryName: query.name,
        spaceId,
        generatedAt: new Date().toISOString(),
        filters,
        totals: {
            storiesScanned: selectedStories.length,
            storiesMatched: matchedStoryIds.size,
            matches: matches.length,
        },
        matches,
    };
};

const resolveStoryFetchOptions = (filters: ComponentUsageFilters) => {
    if (filters.startsWith) {
        return { starts_with: filters.startsWith };
    }

    return {};
};

export const inspectStoryblokStories = async (
    args: InspectStoryblokStoriesArgs,
    config: RequestBaseConfig,
): Promise<ComponentUsageReport> => {
    const { query, spaceId, filters } = args;

    if (filters.withSlug && filters.withSlug.length > 0) {
        const stories = await Promise.all(
            filters.withSlug.map((slug) =>
                getStoryBySlug(slug, {
                    ...config,
                    spaceId,
                }),
            ),
        );

        return inspectFetchedStories({
            stories: stories.filter(Boolean),
            query,
            spaceId,
            filters,
        });
    }

    const stories = await getAllStories(
        { options: resolveStoryFetchOptions(filters) },
        {
            ...config,
            spaceId,
        },
    );

    return inspectFetchedStories({
        stories,
        query,
        spaceId,
        filters,
    });
};
