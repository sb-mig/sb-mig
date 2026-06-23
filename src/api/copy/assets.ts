import type { CopyGraph, CopyGraphAssetFolderNode } from "./types.js";
import type { SBAssetFolder } from "../assets/asset-folders.types.js";
import type { SBAsset } from "../assets/assets.types.js";

import { createCopyGraph } from "./graph.js";

export const COPY_ASSETS_DRY_RUN_LIMITATIONS = [
    "target_conflicts_not_checked",
    "target_asset_identity_not_resolved",
    "manifests_not_written_in_dry_run",
];

const getAssetFolderPath = (
    folder: SBAssetFolder,
    folderById: Map<number, SBAssetFolder>,
): string => {
    const names = [folder.name];
    const visited = new Set<number>([folder.id]);
    let parentId = folder.parent_id;

    while (parentId !== null && parentId !== undefined) {
        const parent = folderById.get(parentId);

        if (!parent || visited.has(parent.id)) {
            break;
        }

        names.unshift(parent.name);
        visited.add(parent.id);
        parentId = parent.parent_id;
    }

    return names.join("/");
};

const getAssetFolderDepth = (
    folder: SBAssetFolder,
    folderById: Map<number, SBAssetFolder>,
): number => {
    let depth = 0;
    const visited = new Set<number>([folder.id]);
    let parentId = folder.parent_id;

    while (parentId !== null && parentId !== undefined) {
        const parent = folderById.get(parentId);

        if (!parent || visited.has(parent.id)) {
            break;
        }

        depth += 1;
        visited.add(parent.id);
        parentId = parent.parent_id;
    }

    return depth;
};

export const buildCopyAssetsGraph = ({
    sourceSpaceId,
    targetSpaceId,
    assets,
    assetFolders,
    generatedAt,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    assets: SBAsset[];
    assetFolders: SBAssetFolder[];
    generatedAt?: string;
}): CopyGraph => {
    const graph = createCopyGraph({
        sourceSpaceId,
        targetSpaceId,
        generatedAt,
        scope: {
            command: "copy assets",
        },
    });

    graph.limitations.push(...COPY_ASSETS_DRY_RUN_LIMITATIONS);

    const folderById = new Map(
        assetFolders.map((folder) => [folder.id, folder] as const),
    );

    const folderNodes: CopyGraphAssetFolderNode[] = assetFolders
        .map((folder) => ({
            type: "asset_folder" as const,
            sourceId: folder.id,
            sourcePath: getAssetFolderPath(folder, folderById),
            targetPath: getAssetFolderPath(folder, folderById),
            sourceParentId: folder.parent_id,
            action: "create" as const,
            depth: getAssetFolderDepth(folder, folderById),
        }))
        .sort(
            (left, right) =>
                left.depth - right.depth || left.sourceId - right.sourceId,
        )
        .map(({ depth: _depth, ...node }) => node);

    graph.assetFolders.push(...folderNodes);

    for (const folder of assetFolders) {
        if (
            folder.parent_id !== null &&
            folder.parent_id !== undefined &&
            !folderById.has(folder.parent_id)
        ) {
            graph.warnings.push({
                code: "asset_folder_parent_missing",
                message: `Asset folder '${folder.name}' references parent id ${folder.parent_id}, but that parent was not returned by Storyblok.`,
                path: getAssetFolderPath(folder, folderById),
                sourceValue: folder.parent_id,
            });
        }
    }

    graph.assets.push(
        ...assets
            .map((asset) => ({
                type: "asset" as const,
                sourceId: asset.id,
                sourceFilename: asset.filename,
                targetFilename: asset.filename,
                sourceAssetFolderId: asset.asset_folder_id ?? null,
                action: "create" as const,
            }))
            .sort((left, right) => left.sourceId - right.sourceId),
    );

    return graph;
};
