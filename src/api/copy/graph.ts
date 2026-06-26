import type { CopyGraph, CopyGraphSummary, CopyScope } from "./types.js";

export const createCopyGraph = ({
    sourceSpaceId,
    targetSpaceId,
    scope,
    generatedAt = new Date().toISOString(),
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    scope: CopyScope;
    generatedAt?: string;
}): CopyGraph => ({
    schemaVersion: 1,
    sourceSpaceId,
    targetSpaceId,
    generatedAt,
    scope,
    stories: [],
    assets: [],
    assetFolders: [],
    storyReferences: [],
    assetReferences: [],
    opaqueFields: [],
    warnings: [],
    errors: [],
    limitations: [],
});

export const summarizeCopyGraph = (graph: CopyGraph): CopyGraphSummary => ({
    stories: graph.stories.length,
    assets: graph.assets.length,
    assetFolders: graph.assetFolders.length,
    storyReferences: graph.storyReferences.length,
    assetReferences: graph.assetReferences.length,
    opaqueFields: graph.opaqueFields.length,
    warnings: graph.warnings.length,
    errors: graph.errors.length,
    limitations: graph.limitations.length,
});
