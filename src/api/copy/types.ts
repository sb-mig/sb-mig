export type CopyResourceType = "story" | "asset" | "asset_folder";

export type CopyAction =
    | "created"
    | "updated"
    | "skipped"
    | "matched_by_manifest"
    | "matched_by_target_key"
    | "failed";

export type CopyGraphAction =
    | "create"
    | "update"
    | "skip"
    | "match"
    | "unknown";

export type CopyWarning = {
    code: string;
    message: string;
    path?: string;
    sourceValue?: unknown;
    targetValue?: unknown;
};

export type CopyError = {
    code: string;
    message: string;
    path?: string;
    sourceValue?: unknown;
};

type CopyManifestEntryBase = {
    source_space_id: string;
    target_space_id: string;
    action: CopyAction;
    created_at: string;
};

export type CopyStoryManifestEntry = CopyManifestEntryBase & {
    type: "story";
    source_id: number;
    target_id: number;
    source_uuid: string;
    target_uuid: string;
    source_full_slug?: string;
    target_full_slug?: string;
};

export type CopyAssetManifestEntry = CopyManifestEntryBase & {
    type: "asset";
    source_id: number;
    target_id: number;
    source_filename: string;
    target_filename: string;
    source_asset_folder_id?: number | null;
    target_asset_folder_id?: number | null;
};

export type CopyAssetFolderManifestEntry = CopyManifestEntryBase & {
    type: "asset_folder";
    source_id: number;
    target_id: number;
    source_name?: string;
    target_name?: string;
    source_parent_id?: number | null;
    target_parent_id?: number | null;
    source_path?: string;
    target_path?: string;
};

export type CopyManifestEntry =
    | CopyStoryManifestEntry
    | CopyAssetManifestEntry
    | CopyAssetFolderManifestEntry;

export type CopyMaps = {
    storyIds: Map<number, number>;
    storyUuids: Map<string, string>;
    assetIds: Map<number, { id: number; filename: string }>;
    assetFilenames: Map<string, string>;
    assetFolderIds: Map<number, number>;
};

export type CopyScope = {
    command: "copy stories" | "copy assets" | "copy space";
    source?: string;
    destination?: string;
    mode?: "subtree" | "children" | "self";
    withAssets?: boolean;
    referencePolicy?: "preserve" | "fail" | "include-referenced";
};

export type CopyGraphStoryNode = {
    type: "story";
    sourceId: number;
    sourceUuid?: string;
    sourceFullSlug: string;
    targetFullSlug?: string;
    isFolder?: boolean;
    action: CopyGraphAction;
};

export type CopyGraphAssetNode = {
    type: "asset";
    sourceId: number;
    sourceFilename: string;
    targetFilename?: string;
    sourceAssetFolderId?: number | null;
    targetAssetFolderId?: number | null;
    action: CopyGraphAction;
};

export type CopyGraphAssetFolderNode = {
    type: "asset_folder";
    sourceId: number;
    sourcePath?: string;
    targetPath?: string;
    sourceParentId?: number | null;
    targetParentId?: number | null;
    action: CopyGraphAction;
};

export type CopyGraphStoryReference = {
    type: "story_reference";
    sourceStoryId?: number;
    sourceStoryUuid?: string;
    sourceStoryFullSlug?: string;
    referencedStoryId?: number;
    referencedStoryUuid?: string;
    path: string;
    status: "mapped" | "preserved_external" | "unresolved" | "unsupported";
};

export type CopyGraph = {
    schemaVersion: 1;
    sourceSpaceId: string;
    targetSpaceId: string;
    generatedAt: string;
    scope: CopyScope;
    stories: CopyGraphStoryNode[];
    assets: CopyGraphAssetNode[];
    assetFolders: CopyGraphAssetFolderNode[];
    storyReferences: CopyGraphStoryReference[];
    warnings: CopyWarning[];
    errors: CopyError[];
    limitations: string[];
};

export type CopyGraphSummary = {
    stories: number;
    assets: number;
    assetFolders: number;
    storyReferences: number;
    warnings: number;
    errors: number;
    limitations: number;
};
