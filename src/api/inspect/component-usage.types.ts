export interface ComponentUsageStoryRef {
    id: number | string;
    name?: string;
    slug?: string;
    full_slug?: string;
    is_folder?: boolean;
    content?: Record<string, unknown>;
}

export interface ComponentUsageQueryContext {
    story: ComponentUsageStoryRef;
    path: string;
    parent?: Record<string, unknown>;
    ancestors: Array<Record<string, unknown>>;
}

export type ComponentUsageQueryMatchResult =
    | boolean
    | Record<string, unknown>
    | null
    | undefined;

export interface ComponentUsageQuery {
    name: string;
    description?: string;
    match: (
        node: Record<string, any>,
        context: ComponentUsageQueryContext,
    ) =>
        | ComponentUsageQueryMatchResult
        | Promise<ComponentUsageQueryMatchResult>;
}

export interface ComponentUsageMatch {
    storyId: number | string;
    storyName?: string;
    storySlug?: string;
    storyFullSlug?: string;
    component: string;
    uid?: string;
    path: string;
    parentComponent?: string;
    parentUid?: string;
    details?: Record<string, unknown>;
}

export interface ComponentUsageFilters {
    all?: boolean;
    withSlug?: string[];
    startsWith?: string;
}

export interface ComponentUsageReport {
    queryName: string;
    spaceId: string;
    generatedAt: string;
    filters: ComponentUsageFilters;
    totals: {
        storiesScanned: number;
        storiesMatched: number;
        matches: number;
    };
    matches: ComponentUsageMatch[];
}

export interface InspectFetchedStoriesArgs {
    stories: any[];
    query: ComponentUsageQuery;
    spaceId: string;
    filters?: ComponentUsageFilters;
}

export interface InspectStoryblokStoriesArgs {
    query: ComponentUsageQuery;
    spaceId: string;
    filters: ComponentUsageFilters;
    includeFolders?: boolean;
}
