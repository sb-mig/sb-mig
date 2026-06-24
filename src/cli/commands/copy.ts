import type {
    CopyGraph,
    CopyMaps,
    CopyAssetFolderManifestEntry,
    CopyAssetManifestEntry,
    CopyManifestEntry,
    CopyStoryManifestEntry,
} from "../../api/copy/index.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import fs from "fs/promises";
import path from "path";

import {
    appendManifestEntry,
    buildCopyAssetsGraph,
    buildCopyMaps,
    createCopyGraph,
    dedupeManifestFile,
    getDefaultCopyManifestPaths,
    loadManifest,
    rewriteCopyReferences,
    scanStoriesReferences,
    summarizeCopyGraph,
} from "../../api/copy/index.js";
import { managementApi } from "../../api/managementApi.js";
import { createTree } from "../../api/stories/tree.js";
import Logger from "../../utils/logger.js";
import { getFileName } from "../../utils/string-utils.js";
import { apiConfig } from "../api-config.js";

const COPY_COMMANDS = {
    stories: "stories",
    assets: "assets",
};

const COPY_MODES = ["subtree", "children", "self"] as const;

type CopyMode = (typeof COPY_MODES)[number];

type CopySelection = {
    source: string;
    mode: CopyMode;
};

type CopyPlanItem = {
    type: "folder" | "story";
    sourceFullSlug: string;
    targetFullSlug: string;
    name: string;
    action: "create";
    conflict?: boolean;
};

type CopyPlanWarning = {
    code: string;
    message: string;
    targetFullSlug?: string;
};

type CopyDryRunReport = {
    schemaVersion: 1;
    command: "copy stories";
    dryRun: true;
    generatedAt: string;
    input: Record<string, any>;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        source: string;
        destination: string;
        mode: CopyMode;
        withAssets: boolean;
    };
    summary: {
        plannedCreates: number;
        folders: number;
        stories: number;
        assetFolders: number;
        assets: number;
        assetReferences: number;
        assetReferencesMapped: number;
        assetReferencesPlanned: number;
        assetReferencesUnresolved: number;
        assetsMapped: number;
        assetsToCopy: number;
        storyReferences: number;
        storyReferencesMapped: number;
        storyReferencesPreserved: number;
        storyReferencesUnresolved: number;
        conflicts: number;
        warnings: number;
        errors: number;
    };
    items: CopyPlanItem[];
    graph?: CopyGraph;
    warnings: CopyPlanWarning[];
    errors: any[];
    limitations: string[];
    commands: {
        dryRun: string;
        apply: string;
    };
};

type CopyAssetsDryRunReport = {
    schemaVersion: 1;
    command: "copy assets";
    dryRun: true;
    generatedAt: string;
    input: Record<string, any>;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        selection: "all";
    };
    summary: {
        plannedCreates: number;
        assetFolders: number;
        assets: number;
        warnings: number;
        errors: number;
    };
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    limitations: string[];
    commands: {
        dryRun: string;
        apply: string;
    };
};

type CopyAssetsApplyReport = {
    schemaVersion: 1;
    command: "copy assets";
    dryRun: false;
    generatedAt: string;
    input: Record<string, any>;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        selection: "all";
    };
    summary: {
        assetFoldersCreated: number;
        assetFoldersMatched: number;
        assetsCreated: number;
        assetsMatched: number;
        warnings: number;
        errors: number;
    };
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    manifestPaths: {
        assets: string;
        assetFolders: string;
        combined: string;
    };
    warnings: any[];
    errors: any[];
};

const COPY_DRY_RUN_BASE_LIMITATIONS = [
    "create_or_match",
    "target_state_may_change",
];
const COPY_DRY_RUN_STORY_ONLY_LIMITATIONS = [
    "assets_not_copied_by_story_command",
    "asset_rewrite_requires_existing_asset_manifest",
];
const COPY_DRY_RUN_WITH_ASSETS_LIMITATIONS = [
    "target_asset_identity_not_resolved_until_apply",
];

const isCopyMode = (value: string): value is CopyMode =>
    COPY_MODES.includes(value as CopyMode);

const readStringFlag = (
    flags: Record<string, any>,
    names: string[],
): string | undefined => {
    for (const name of names) {
        const value = flags[name];

        if (value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }

    return undefined;
};

const getCopySpace = (
    flags: Record<string, any>,
    names: string[],
    fallback: string,
): string => readStringFlag(flags, names) ?? fallback;

const normalizeDestination = (destination: string | undefined): string =>
    !destination || destination === "/" || destination === "root"
        ? ""
        : destination.replace(/^\/+|\/+$/g, "");

const joinSlugs = (...parts: Array<string | undefined>): string =>
    parts
        .filter((part): part is string => Boolean(part))
        .map((part) => part.replace(/^\/+|\/+$/g, ""))
        .filter((part) => part.length > 0)
        .join("/");

const resolveCopySelection = (flags: Record<string, any>): CopySelection => {
    const rawSource = readStringFlag(flags, ["source", "what"]);

    if (!rawSource) {
        throw new Error(
            "Missing source. Pass --source <full_slug> (or legacy --what <full_slug>).",
        );
    }

    const rawMode = readStringFlag(flags, ["mode"]);
    if (rawMode && !isCopyMode(rawMode)) {
        throw new Error(
            `Unsupported copy mode '${rawMode}'. Use one of: ${COPY_MODES.join(", ")}.`,
        );
    }
    const explicitMode = rawMode as CopyMode | undefined;

    if (rawSource.endsWith("/*")) {
        return {
            source: rawSource.slice(0, -2),
            mode: explicitMode ?? "children",
        };
    }

    return {
        source: rawSource,
        mode: explicitMode ?? "subtree",
    };
};

const resolveDestinationParentId = async (
    destination: string | undefined,
    targetSpace: string,
): Promise<number | null> => {
    if (!destination || destination === "/" || destination === "root") {
        return null;
    }

    const targetEntryStory = await managementApi.stories.getStoryBySlug(
        destination,
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );

    if (!targetEntryStory) {
        throw new Error(
            `Destination story or folder not found in target space: ${destination}`,
        );
    }

    if (!targetEntryStory.story.is_folder) {
        throw new Error(
            `Destination must be a folder or root. '${destination}' is not a folder.`,
        );
    }

    return targetEntryStory.story.id;
};

const getStoryBySlugOrThrow = async (slug: string, sourceSpace: string) => {
    const entryStory = await managementApi.stories.getStoryBySlug(slug, {
        ...apiConfig,
        spaceId: sourceSpace,
    });

    if (!entryStory) {
        throw new Error(`Source story or folder not found: ${slug}`);
    }

    return entryStory;
};

const getStoriesForSelection = async (
    selection: CopySelection,
    sourceSpace: string,
) => {
    const rootStory = await getStoryBySlugOrThrow(
        selection.source,
        sourceSpace,
    );
    const root = rootStory.story;

    if (selection.mode === "self") {
        return [rootStory];
    }

    if (!root.is_folder) {
        if (selection.mode === "children") {
            throw new Error(
                `Copy mode 'children' requires a folder source. '${selection.source}' is not a folder.`,
            );
        }

        return [rootStory];
    }

    const children = await managementApi.stories.getAllStories(
        {
            options: {
                starts_with: `${selection.source}/`,
            },
        },
        {
            ...apiConfig,
            spaceId: sourceSpace,
        },
    );

    return [rootStory, ...children];
};

const stripGeneratedStoryFields = (story: any) => {
    const {
        id,
        uuid,
        created_at,
        updated_at,
        published_at,
        first_published_at,
        last_author,
        alternates,
        parent,
        ...copyableStory
    } = story;

    return copyableStory;
};

const normalizeStoriesForTree = (
    stories: any[],
    selection: CopySelection,
): any[] =>
    stories.map((item: any) => {
        const story = item.story;
        const copyableStory = stripGeneratedStoryFields(story);

        if (story.full_slug === selection.source) {
            return {
                ...copyableStory,
                id: story.id,
                parent_id: null,
            };
        }

        return {
            ...copyableStory,
            id: story.id,
            parent_id: story.parent_id === 0 ? null : story.parent_id,
        };
    });

const selectTreeRoots = (tree: any[], selection: CopySelection): any[] => {
    if (selection.mode === "children") {
        return tree[0]?.children ?? [];
    }

    return tree;
};

const prepareTreeForCreate = (tree: any[]): any[] =>
    tree.map((node) => ({
        ...node,
        story: stripGeneratedStoryFields(node.story),
        children: node.children ? prepareTreeForCreate(node.children) : [],
    }));

const resolveStorySlug = (story: any): string => {
    if (typeof story.slug === "string" && story.slug.length > 0) {
        return story.slug;
    }

    const fullSlug = String(story.full_slug ?? "");
    return fullSlug.split("/").filter(Boolean).at(-1) ?? "";
};

const buildCopyPlan = (
    tree: any[],
    destination: string | undefined,
): CopyPlanItem[] => {
    const destinationRoot = normalizeDestination(destination);
    const plan: CopyPlanItem[] = [];

    const walk = (nodes: any[], parentTargetSlug: string) => {
        for (const node of nodes) {
            const story = node.story;
            const targetFullSlug = joinSlugs(
                parentTargetSlug,
                resolveStorySlug(story),
            );

            plan.push({
                type: story.is_folder ? "folder" : "story",
                sourceFullSlug: String(story.full_slug ?? story.slug ?? ""),
                targetFullSlug,
                name: String(story.name ?? story.slug ?? "unknown"),
                action: "create",
            });

            if (node.children?.length) {
                walk(node.children, targetFullSlug);
            }
        }
    };

    walk(tree, destinationRoot);

    return plan;
};

const findTargetConflicts = async (
    plan: CopyPlanItem[],
    targetSpace: string,
): Promise<CopyPlanItem[]> => {
    const conflicts: CopyPlanItem[] = [];

    for (const item of plan) {
        const existingStory = await managementApi.stories.getStoryBySlug(
            item.targetFullSlug,
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );

        if (existingStory) {
            conflicts.push(item);
        }
    }

    return conflicts;
};

const withConflictFlags = (
    plan: CopyPlanItem[],
    conflicts: CopyPlanItem[],
): CopyPlanItem[] => {
    const conflictSlugs = new Set(
        conflicts.map((conflict) => conflict.targetFullSlug),
    );

    return plan.map((item) => ({
        ...item,
        ...(conflictSlugs.has(item.targetFullSlug) ? { conflict: true } : {}),
    }));
};

const buildDryRunWarnings = ({
    conflicts,
    withAssets,
}: {
    conflicts: CopyPlanItem[];
    withAssets: boolean;
}): CopyPlanWarning[] => [
    ...conflicts.map((conflict) => ({
        code: "target_exists",
        message: `Target ${conflict.type} already exists at '${conflict.targetFullSlug}'. Current copy is create-only, so the real copy may fail.`,
        targetFullSlug: conflict.targetFullSlug,
    })),
    ...(withAssets
        ? []
        : [
              {
                  code: "assets_not_copied_by_story_command",
                  message:
                      "Assets are not copied by this command unless --with-assets is passed.",
              },
              {
                  code: "asset_rewrite_requires_existing_asset_manifest",
                  message:
                      "Asset fields are rewritten only when matching asset manifest entries already exist.",
              },
          ]),
];

const quoteCommandArg = (value: string): string =>
    /^[a-zA-Z0-9_./:-]+$/.test(value) ? value : JSON.stringify(value);

const buildCopyCommand = ({
    sourceSpace,
    targetSpace,
    selection,
    destination,
    withAssets,
    dryRun,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    withAssets?: boolean;
    dryRun: boolean;
    outputPath?: string;
}): string => {
    const args = [
        "sb-mig",
        "copy",
        "stories",
        "--from",
        sourceSpace,
        "--to",
        targetSpace,
        "--source",
        selection.source,
        "--mode",
        selection.mode,
    ];

    if (destination) {
        args.push("--destination", destination);
    }

    if (withAssets) {
        args.push("--with-assets");
    }

    if (dryRun) {
        args.push("--dry-run");
    }

    if (outputPath) {
        args.push("--outputPath", outputPath);
    }

    return args.map(quoteCommandArg).join(" ");
};

const buildCopyAssetsCommand = ({
    sourceSpace,
    targetSpace,
    dryRun,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    dryRun: boolean;
    outputPath?: string;
}): string => {
    const args = [
        "sb-mig",
        "copy",
        "assets",
        "--from",
        sourceSpace,
        "--to",
        targetSpace,
        "--all",
    ];

    if (dryRun) {
        args.push("--dry-run");
    }

    if (outputPath) {
        args.push("--outputPath", outputPath);
    }

    return args.map(quoteCommandArg).join(" ");
};

const buildCopyDryRunReport = ({
    sourceSpace,
    targetSpace,
    selection,
    destination,
    withAssets,
    input,
    plan,
    conflicts,
    graph,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    withAssets: boolean;
    input: Record<string, any>;
    plan: CopyPlanItem[];
    conflicts: CopyPlanItem[];
    graph?: CopyGraph;
    outputPath?: string;
}): CopyDryRunReport => {
    const items = withConflictFlags(plan, conflicts);
    const warnings = buildDryRunWarnings({ conflicts, withAssets });
    const graphSummary = graph ? summarizeCopyGraph(graph) : undefined;
    const assetReferencesMapped =
        graph?.assetReferences.filter(
            (reference) => reference.status === "mapped",
        ).length ?? 0;
    const assetReferencesPlanned =
        graph?.assetReferences.filter(
            (reference) => reference.status === "planned",
        ).length ?? 0;
    const assetReferencesUnresolved =
        graph?.assetReferences.filter(
            (reference) => reference.status === "unresolved",
        ).length ?? 0;
    const storyReferencesMapped =
        graph?.storyReferences.filter(
            (reference) => reference.status === "mapped",
        ).length ?? 0;
    const storyReferencesPreserved =
        graph?.storyReferences.filter(
            (reference) => reference.status === "preserved_external",
        ).length ?? 0;
    const storyReferencesUnresolved =
        graph?.storyReferences.filter(
            (reference) => reference.status === "unresolved",
        ).length ?? 0;
    const assetsMapped =
        graph?.assets.filter((asset) => asset.action === "match").length ?? 0;
    const assetsToCopy =
        graph?.assets.filter((asset) => asset.action === "create").length ?? 0;
    const limitations = [
        ...COPY_DRY_RUN_BASE_LIMITATIONS,
        ...(withAssets
            ? COPY_DRY_RUN_WITH_ASSETS_LIMITATIONS
            : COPY_DRY_RUN_STORY_ONLY_LIMITATIONS),
    ];

    return {
        schemaVersion: 1,
        command: "copy stories",
        dryRun: true,
        generatedAt: new Date().toISOString(),
        input,
        normalized: {
            sourceSpaceId: sourceSpace,
            targetSpaceId: targetSpace,
            source: selection.source,
            destination: normalizeDestination(destination) || "root",
            mode: selection.mode,
            withAssets,
        },
        summary: {
            plannedCreates: items.length,
            folders: items.filter((item) => item.type === "folder").length,
            stories: items.filter((item) => item.type === "story").length,
            assetFolders: graphSummary?.assetFolders ?? 0,
            assets: graphSummary?.assets ?? 0,
            assetReferences: graphSummary?.assetReferences ?? 0,
            assetReferencesMapped,
            assetReferencesPlanned,
            assetReferencesUnresolved,
            assetsMapped,
            assetsToCopy,
            storyReferences: graphSummary?.storyReferences ?? 0,
            storyReferencesMapped,
            storyReferencesPreserved,
            storyReferencesUnresolved,
            conflicts: conflicts.length,
            warnings: warnings.length + (graphSummary?.warnings ?? 0),
            errors: graphSummary?.errors ?? 0,
        },
        items,
        ...(graph ? { graph } : {}),
        warnings,
        errors: graph?.errors ?? [],
        limitations,
        commands: {
            dryRun: buildCopyCommand({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                withAssets,
                dryRun: true,
                outputPath,
            }),
            apply: buildCopyCommand({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                withAssets,
                dryRun: false,
            }),
        },
    };
};

const buildCopyAssetsDryRunReport = ({
    sourceSpace,
    targetSpace,
    input,
    outputPath,
    graph,
}: {
    sourceSpace: string;
    targetSpace: string;
    input: Record<string, any>;
    outputPath?: string;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
}): CopyAssetsDryRunReport => {
    const graphSummary = summarizeCopyGraph(graph);

    return {
        schemaVersion: 1,
        command: "copy assets",
        dryRun: true,
        generatedAt: graph.generatedAt,
        input,
        normalized: {
            sourceSpaceId: sourceSpace,
            targetSpaceId: targetSpace,
            selection: "all",
        },
        summary: {
            plannedCreates: graphSummary.assetFolders + graphSummary.assets,
            assetFolders: graphSummary.assetFolders,
            assets: graphSummary.assets,
            warnings: graphSummary.warnings,
            errors: graphSummary.errors,
        },
        graph,
        limitations: graph.limitations,
        commands: {
            dryRun: buildCopyAssetsCommand({
                sourceSpace,
                targetSpace,
                dryRun: true,
                outputPath,
            }),
            apply: buildCopyAssetsCommand({
                sourceSpace,
                targetSpace,
                dryRun: false,
            }),
        },
    };
};

const writeDryRunReport = async (outputPath: string, report: unknown) => {
    const outputDirectory = path.dirname(outputPath);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    Logger.success(`[dry-run] Copy plan written to ${outputPath}`);
};

const writeJsonReport = async (outputPath: string, report: unknown) => {
    const outputDirectory = path.dirname(outputPath);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    Logger.success(`Copy report written to ${outputPath}`);
};

const appendCopyManifestEntry = async ({
    combinedPath,
    resourcePath,
    entry,
}: {
    combinedPath: string;
    resourcePath: string;
    entry: CopyManifestEntry;
}) => {
    await appendManifestEntry(resourcePath, entry);
    await appendManifestEntry(combinedPath, entry);
};

const getAssetFolderPath = (
    folder: any,
    folderById: Map<number, any>,
): string => {
    const names = [String(folder.name ?? folder.id)];
    const visited = new Set<number>([Number(folder.id)]);
    let parentId = folder.parent_id;

    while (parentId !== null && parentId !== undefined) {
        const parent = folderById.get(Number(parentId));

        if (!parent || visited.has(Number(parent.id))) {
            break;
        }

        names.unshift(String(parent.name ?? parent.id));
        visited.add(Number(parent.id));
        parentId = parent.parent_id;
    }

    return names.join("/");
};

const buildAssetFolderPathMap = (folders: any[]): Map<string, any> => {
    const folderById = new Map(
        folders.map((folder) => [Number(folder.id), folder] as const),
    );
    const folderByPath = new Map<string, any>();

    for (const folder of folders) {
        folderByPath.set(getAssetFolderPath(folder, folderById), folder);
    }

    return folderByPath;
};

const getAssetMetadataPayload = (asset: any) => ({
    ...(asset.alt ? { alt: asset.alt } : {}),
    ...(asset.title ? { title: asset.title } : {}),
    ...(asset.copyright ? { copyright: asset.copyright } : {}),
    ...(asset.source ? { source: asset.source } : {}),
    ...(asset.focus ? { focus: asset.focus } : {}),
    ...(asset.meta_data ? { meta_data: asset.meta_data } : {}),
    ...(asset.is_private === undefined ? {} : { is_private: asset.is_private }),
    ...(asset.locked === undefined ? {} : { locked: asset.locked }),
    ...(asset.publish_at === undefined ? {} : { publish_at: asset.publish_at }),
    ...(asset.internal_tag_ids?.length
        ? { internal_tag_ids: asset.internal_tag_ids }
        : {}),
});

const findUniqueTargetAssetByFileName = (
    targetAssets: any[],
    fileName: string,
): any | undefined => {
    const matches = targetAssets.filter(
        (asset) => getFileName(asset.filename) === fileName,
    );

    return matches.length === 1 ? matches[0] : undefined;
};

const buildCopyAssetsApplyReport = ({
    sourceSpace,
    targetSpace,
    input,
    graph,
    manifestPaths,
    assetFoldersCreated,
    assetFoldersMatched,
    assetsCreated,
    assetsMatched,
}: {
    sourceSpace: string;
    targetSpace: string;
    input: Record<string, any>;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    manifestPaths: ReturnType<typeof getDefaultCopyManifestPaths>;
    assetFoldersCreated: number;
    assetFoldersMatched: number;
    assetsCreated: number;
    assetsMatched: number;
}): CopyAssetsApplyReport => ({
    schemaVersion: 1,
    command: "copy assets",
    dryRun: false,
    generatedAt: graph.generatedAt,
    input,
    normalized: {
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        selection: "all",
    },
    summary: {
        assetFoldersCreated,
        assetFoldersMatched,
        assetsCreated,
        assetsMatched,
        warnings: graph.warnings.length,
        errors: graph.errors.length,
    },
    graph,
    manifestPaths: {
        assets: manifestPaths.assets,
        assetFolders: manifestPaths.assetFolders,
        combined: manifestPaths.combined,
    },
    warnings: graph.warnings,
    errors: graph.errors,
});

const buildSourceStoryById = (sourceStories: any[]): Map<number, any> =>
    new Map(
        sourceStories
            .map((item) => item?.story)
            .filter(Boolean)
            .map((story) => [Number(story.id), story] as const),
    );

const buildTargetSlugBySourceSlug = (
    plan: CopyPlanItem[],
): Map<string, string> =>
    new Map(
        plan.map((item) => [item.sourceFullSlug, item.targetFullSlug] as const),
    );

const buildComponentSchemaRegistry = async (
    sourceSpace: string,
): Promise<Record<string, any>> => {
    const components = await managementApi.components.getAllComponents({
        ...apiConfig,
        spaceId: sourceSpace,
    });

    if (!Array.isArray(components)) {
        return {};
    }

    return Object.fromEntries(
        components
            .filter((component: any) => component?.name && component?.schema)
            .map((component: any) => [component.name, component.schema]),
    );
};

const collectAssetFolderAncestors = ({
    assets,
    assetFolders,
}: {
    assets: any[];
    assetFolders: any[];
}): any[] => {
    const folderById = new Map(
        assetFolders.map((folder) => [Number(folder.id), folder] as const),
    );
    const selectedFolderIds = new Set<number>();

    for (const asset of assets) {
        let folderId = asset.asset_folder_id;
        const visited = new Set<number>();

        while (folderId !== null && folderId !== undefined) {
            const numericFolderId = Number(folderId);

            if (visited.has(numericFolderId)) {
                break;
            }

            visited.add(numericFolderId);
            selectedFolderIds.add(numericFolderId);

            const folder = folderById.get(numericFolderId);
            if (!folder) {
                break;
            }

            folderId = folder.parent_id;
        }
    }

    return assetFolders.filter((folder) =>
        selectedFolderIds.has(Number(folder.id)),
    );
};

const hasMappedAssetReference = ({
    assetId,
    filename,
    copyMaps,
}: {
    assetId?: number;
    filename?: string;
    copyMaps: CopyMaps;
}): boolean =>
    (assetId !== undefined && copyMaps.assetIds.has(assetId)) ||
    (filename !== undefined && copyMaps.assetFilenames.has(filename));

const annotateReferencesWithManifestMaps = ({
    graph,
    copyMaps,
    withAssets,
}: {
    graph: CopyGraph;
    copyMaps: CopyMaps;
    withAssets: boolean;
}) => {
    for (const reference of graph.assetReferences) {
        if (hasMappedAssetReference({ ...reference, copyMaps })) {
            reference.status = "mapped";
            continue;
        }

        if (!withAssets && reference.status === "planned") {
            reference.status = "unresolved";
        }
    }

    for (const reference of graph.storyReferences) {
        if (
            (reference.referencedStoryId !== undefined &&
                copyMaps.storyIds.has(reference.referencedStoryId)) ||
            (reference.referencedStoryUuid !== undefined &&
                copyMaps.storyUuids.has(reference.referencedStoryUuid))
        ) {
            reference.status = "mapped";
        }
    }
};

const annotateAssetsWithManifestMaps = ({
    graph,
    copyMaps,
}: {
    graph: CopyGraph;
    copyMaps: CopyMaps;
}) => {
    for (const folder of graph.assetFolders) {
        const targetFolderId = copyMaps.assetFolderIds.get(folder.sourceId);

        if (targetFolderId === undefined) {
            continue;
        }

        folder.targetParentId =
            folder.sourceParentId === null ||
            folder.sourceParentId === undefined
                ? null
                : (copyMaps.assetFolderIds.get(folder.sourceParentId) ?? null);
        folder.action = "match";
    }

    for (const asset of graph.assets) {
        const mappedAsset = copyMaps.assetIds.get(asset.sourceId);
        const targetFilename =
            mappedAsset?.filename ??
            copyMaps.assetFilenames.get(asset.sourceFilename);

        if (!mappedAsset && !targetFilename) {
            continue;
        }

        asset.action = "match";
        asset.targetFilename = targetFilename ?? asset.targetFilename;
        asset.targetAssetFolderId =
            asset.sourceAssetFolderId === null ||
            asset.sourceAssetFolderId === undefined
                ? null
                : (copyMaps.assetFolderIds.get(asset.sourceAssetFolderId) ??
                  null);
    }
};

const buildStoryReferenceDryRunGraph = ({
    sourceSpace,
    targetSpace,
    selection,
    destination,
    plan,
    sourceStories,
    schemas,
    copyMaps,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    plan: CopyPlanItem[];
    sourceStories: any[];
    schemas: Record<string, any>;
    copyMaps: CopyMaps;
}): CopyGraph => {
    const sourceStoryByFullSlug = new Map(
        sourceStories
            .map((item) => item?.story)
            .filter(Boolean)
            .map((story) => [String(story.full_slug ?? ""), story] as const),
    );
    const scanResult = scanStoriesReferences({
        stories: sourceStories.map((item) => item?.story).filter(Boolean),
        schemas,
        options: {
            referencePolicy: "preserve",
        },
    });
    const graph = createCopyGraph({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        scope: {
            command: "copy stories",
            source: selection.source,
            destination: normalizeDestination(destination) || "root",
            mode: selection.mode,
            withAssets: false,
            referencePolicy: "preserve",
        },
    });

    graph.stories = plan.map((item) => ({
        type: "story",
        sourceId: Number(
            sourceStoryByFullSlug.get(item.sourceFullSlug)?.id ?? 0,
        ),
        sourceUuid: sourceStoryByFullSlug.get(item.sourceFullSlug)?.uuid,
        sourceFullSlug: item.sourceFullSlug,
        targetFullSlug: item.targetFullSlug,
        isFolder: item.type === "folder",
        action: item.action,
    }));
    graph.assetReferences.push(...scanResult.assetReferences);
    graph.storyReferences.push(...scanResult.storyReferences);
    graph.opaqueFields.push(...scanResult.opaqueFields);
    graph.warnings.push(...scanResult.warnings);
    graph.errors.push(...scanResult.errors);

    annotateReferencesWithManifestMaps({
        graph,
        copyMaps,
        withAssets: false,
    });

    return graph;
};

const buildReferencedAssetsGraph = ({
    sourceSpace,
    targetSpace,
    selection,
    destination,
    plan,
    sourceStories,
    sourceAssets,
    sourceAssetFolders,
    schemas,
    copyMaps,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    plan: CopyPlanItem[];
    sourceStories: any[];
    sourceAssets: any[];
    sourceAssetFolders: any[];
    schemas: Record<string, any>;
    copyMaps: CopyMaps;
}): CopyGraph => {
    const scanResult = scanStoriesReferences({
        stories: sourceStories.map((item) => item?.story).filter(Boolean),
        schemas,
        options: {
            referencePolicy: "preserve",
        },
    });
    const referencedAssetIds = new Set(
        scanResult.assetReferences
            .map((reference) => reference.assetId)
            .filter((assetId): assetId is number => assetId !== undefined),
    );
    const referencedFilenames = new Set(
        scanResult.assetReferences
            .map((reference) => reference.filename)
            .filter((filename): filename is string => filename !== undefined),
    );
    const selectedAssets = sourceAssets.filter(
        (asset) =>
            referencedAssetIds.has(Number(asset.id)) ||
            referencedFilenames.has(String(asset.filename)),
    );
    const selectedAssetIds = new Set(
        selectedAssets.map((asset) => Number(asset.id)),
    );
    const selectedFilenames = new Set(
        selectedAssets.map((asset) => String(asset.filename)),
    );
    const selectedAssetFolders = collectAssetFolderAncestors({
        assets: selectedAssets,
        assetFolders: sourceAssetFolders,
    });
    const sourceStoryByFullSlug = new Map(
        sourceStories
            .map((item) => item?.story)
            .filter(Boolean)
            .map((story) => [String(story.full_slug ?? ""), story] as const),
    );
    const graph = buildCopyAssetsGraph({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        assets: selectedAssets,
        assetFolders: selectedAssetFolders,
    });

    graph.scope = {
        command: "copy stories",
        source: selection.source,
        destination: normalizeDestination(destination) || "root",
        mode: selection.mode,
        withAssets: true,
        referencePolicy: "preserve",
    };
    graph.stories = plan.map((item) => ({
        type: "story",
        sourceId: Number(
            sourceStoryByFullSlug.get(item.sourceFullSlug)?.id ?? 0,
        ),
        sourceUuid: sourceStoryByFullSlug.get(item.sourceFullSlug)?.uuid,
        sourceFullSlug: item.sourceFullSlug,
        targetFullSlug: item.targetFullSlug,
        isFolder: item.type === "folder",
        action: item.action,
    }));
    graph.assetReferences.push(
        ...scanResult.assetReferences.map((reference) => {
            const isPlanned =
                (reference.assetId !== undefined &&
                    selectedAssetIds.has(reference.assetId)) ||
                (reference.filename !== undefined &&
                    selectedFilenames.has(reference.filename));

            return {
                ...reference,
                status: isPlanned ? "planned" : "unresolved",
            } as const;
        }),
    );
    graph.storyReferences.push(...scanResult.storyReferences);
    graph.opaqueFields.push(...scanResult.opaqueFields);
    graph.warnings.push(...scanResult.warnings);
    graph.errors.push(...scanResult.errors);

    annotateReferencesWithManifestMaps({
        graph,
        copyMaps,
        withAssets: true,
    });
    annotateAssetsWithManifestMaps({
        graph,
        copyMaps,
    });

    for (const reference of graph.assetReferences) {
        if (reference.status !== "unresolved") {
            continue;
        }

        graph.warnings.push({
            code: "referenced_asset_not_found",
            message:
                "A story references an asset that was not returned by the source space asset list.",
            path: reference.path,
            sourceValue: reference.assetId ?? reference.filename,
        });
    }

    return graph;
};

const rewriteCopiedStoryContents = async ({
    sourceStories,
    sourceSpace,
    targetSpace,
    manifestRoot,
}: {
    sourceStories: any[];
    sourceSpace: string;
    targetSpace: string;
    manifestRoot?: string;
}) => {
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        rootDir: manifestRoot,
    });
    const manifestEntries = await loadManifest(manifestPaths.combined);
    const maps = buildCopyMaps(manifestEntries);
    const schemas = await buildComponentSchemaRegistry(sourceSpace);
    let updatedStories = 0;
    let rewrittenReferences = 0;

    for (const item of sourceStories) {
        const sourceStory = item?.story;

        if (!sourceStory?.id || !sourceStory.content) {
            continue;
        }

        const targetStoryId = maps.storyIds.get(Number(sourceStory.id));
        if (!targetStoryId) {
            continue;
        }

        const rewritten = rewriteCopyReferences({
            value: sourceStory.content,
            maps,
            schemas,
        });

        if (rewritten.records.length === 0) {
            continue;
        }

        await managementApi.stories.updateStory(
            {
                content: rewritten.value,
            },
            String(targetStoryId),
            {
                force_update: true,
            },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );
        updatedStories += 1;
        rewrittenReferences += rewritten.records.length;
    }

    if (updatedStories > 0) {
        Logger.success(
            `Rewrote ${rewrittenReferences} reference(s) across ${updatedStories} copied story/stories.`,
        );
    }
};

const createStoriesAndWriteManifests = async ({
    tree,
    realParentId,
    sourceStoryById,
    targetSlugBySourceSlug,
    sourceSpace,
    targetSpace,
    manifestRoot,
}: {
    tree: any[];
    realParentId: number | null;
    sourceStoryById: Map<number, any>;
    targetSlugBySourceSlug: Map<string, string>;
    sourceSpace: string;
    targetSpace: string;
    manifestRoot?: string;
}) => {
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        rootDir: manifestRoot,
    });
    const existingManifestEntries = await loadManifest(manifestPaths.combined);
    const copyMaps = buildCopyMaps(existingManifestEntries);

    const walk = async (nodes: any[], parentId: number | null) => {
        for (const node of nodes) {
            const sourceStory = sourceStoryById.get(
                Number(node.id ?? node.story.id),
            );
            const sourceFullSlug = String(
                sourceStory?.full_slug ?? node.story.full_slug ?? "",
            );
            const targetFullSlug = targetSlugBySourceSlug.get(sourceFullSlug);

            if (!sourceStory?.uuid) {
                throw new Error(
                    `Cannot write story manifest for '${sourceFullSlug}' because source uuid is missing.`,
                );
            }

            const mappedTargetId = copyMaps.storyIds.get(
                Number(sourceStory.id),
            );

            if (mappedTargetId) {
                await walk(node.children ?? [], mappedTargetId);
                continue;
            }

            const existingTargetStory = targetFullSlug
                ? await managementApi.stories.getStoryBySlug(targetFullSlug, {
                      ...apiConfig,
                      spaceId: targetSpace,
                  })
                : undefined;
            const createdAt = new Date().toISOString();

            if (existingTargetStory?.story) {
                const targetStory = existingTargetStory.story;
                const entry: CopyStoryManifestEntry = {
                    type: "story",
                    source_space_id: sourceSpace,
                    target_space_id: targetSpace,
                    source_id: Number(sourceStory.id),
                    target_id: Number(targetStory.id),
                    source_uuid: String(sourceStory.uuid),
                    target_uuid: String(targetStory.uuid),
                    source_full_slug: sourceFullSlug,
                    target_full_slug: targetStory.full_slug ?? targetFullSlug,
                    action: "matched_by_target_key",
                    created_at: createdAt,
                };

                await appendCopyManifestEntry({
                    combinedPath: manifestPaths.combined,
                    resourcePath: manifestPaths.stories,
                    entry,
                });
                copyMaps.storyIds.set(entry.source_id, entry.target_id);
                copyMaps.storyUuids.set(entry.source_uuid, entry.target_uuid);

                await walk(node.children ?? [], entry.target_id);
                continue;
            }

            const { parent, ...content } = node.story;
            const createdStoryResult = await managementApi.stories.createStory(
                {
                    ...content,
                    parent_id: parentId,
                },
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );
            const targetStory = createdStoryResult?.story;

            if (!targetStory?.id || !targetStory?.uuid) {
                throw new Error(
                    `Failed to create target story for '${sourceFullSlug}'.`,
                );
            }

            const entry: CopyStoryManifestEntry = {
                type: "story",
                source_space_id: sourceSpace,
                target_space_id: targetSpace,
                source_id: Number(sourceStory.id),
                target_id: Number(targetStory.id),
                source_uuid: String(sourceStory.uuid),
                target_uuid: String(targetStory.uuid),
                source_full_slug: sourceFullSlug,
                target_full_slug: targetStory.full_slug ?? targetFullSlug,
                action: "created",
                created_at: createdAt,
            };

            await appendCopyManifestEntry({
                combinedPath: manifestPaths.combined,
                resourcePath: manifestPaths.stories,
                entry,
            });
            copyMaps.storyIds.set(entry.source_id, entry.target_id);
            copyMaps.storyUuids.set(entry.source_uuid, entry.target_uuid);

            await walk(node.children ?? [], entry.target_id);
        }
    };

    await walk(tree, realParentId);
    await dedupeManifestFile(manifestPaths.stories);
    await dedupeManifestFile(manifestPaths.combined);

    Logger.success(`Story manifest written to ${manifestPaths.stories}`);
};

const copyAssetsAndWriteManifests = async ({
    sourceSpace,
    targetSpace,
    input,
    graph,
    sourceAssets,
    sourceAssetFolders,
    outputPath,
    manifestRoot,
}: {
    sourceSpace: string;
    targetSpace: string;
    input: Record<string, any>;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    sourceAssets: any[];
    sourceAssetFolders: any[];
    outputPath?: string;
    manifestRoot?: string;
}): Promise<CopyAssetsApplyReport> => {
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        rootDir: manifestRoot,
    });
    const existingManifestEntries = await loadManifest(manifestPaths.combined);
    const copyMaps = buildCopyMaps(existingManifestEntries);
    const targetAssetFoldersResult =
        await managementApi.assets.getAllAssetFolders(
            { spaceId: targetSpace },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );
    const targetAssetsResult = await managementApi.assets.getAllAssets(
        { spaceId: targetSpace },
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );
    const targetAssetFolders = Array.isArray(
        targetAssetFoldersResult?.asset_folders,
    )
        ? targetAssetFoldersResult.asset_folders
        : [];
    const targetAssets = Array.isArray(targetAssetsResult?.assets)
        ? targetAssetsResult.assets
        : [];
    const targetFolderByPath = buildAssetFolderPathMap(targetAssetFolders);
    const sourceFolderById = new Map(
        sourceAssetFolders.map(
            (folder) => [Number(folder.id), folder] as const,
        ),
    );
    const graphFolderBySourceId = new Map(
        graph.assetFolders.map((folder) => [folder.sourceId, folder] as const),
    );
    const graphAssetBySourceId = new Map(
        graph.assets.map((asset) => [asset.sourceId, asset] as const),
    );
    let assetFoldersCreated = 0;
    let assetFoldersMatched = 0;
    let assetsCreated = 0;
    let assetsMatched = 0;

    Logger.warning(
        `Copying assets from space '${sourceSpace}' to space '${targetSpace}'.`,
    );

    for (const folderNode of graph.assetFolders) {
        const sourceFolder = sourceFolderById.get(folderNode.sourceId);

        if (!sourceFolder) {
            continue;
        }

        const mappedTargetFolderId = copyMaps.assetFolderIds.get(
            folderNode.sourceId,
        );

        if (mappedTargetFolderId) {
            folderNode.targetParentId =
                sourceFolder.parent_id === null ||
                sourceFolder.parent_id === undefined
                    ? null
                    : (copyMaps.assetFolderIds.get(
                          Number(sourceFolder.parent_id),
                      ) ?? null);
            folderNode.action = "match";
            assetFoldersMatched += 1;
            continue;
        }

        const existingTargetFolder = folderNode.sourcePath
            ? targetFolderByPath.get(folderNode.sourcePath)
            : undefined;
        const createdAt = new Date().toISOString();

        if (existingTargetFolder) {
            const entry: CopyAssetFolderManifestEntry = {
                type: "asset_folder",
                source_space_id: sourceSpace,
                target_space_id: targetSpace,
                source_id: folderNode.sourceId,
                target_id: Number(existingTargetFolder.id),
                source_name: String(sourceFolder.name ?? ""),
                target_name: String(existingTargetFolder.name ?? ""),
                source_parent_id: sourceFolder.parent_id ?? null,
                target_parent_id: existingTargetFolder.parent_id ?? null,
                source_path: folderNode.sourcePath,
                target_path: folderNode.sourcePath,
                action: "matched_by_target_key",
                created_at: createdAt,
            };

            await appendCopyManifestEntry({
                combinedPath: manifestPaths.combined,
                resourcePath: manifestPaths.assetFolders,
                entry,
            });
            copyMaps.assetFolderIds.set(entry.source_id, entry.target_id);
            folderNode.targetParentId = entry.target_parent_id;
            folderNode.action = "match";
            assetFoldersMatched += 1;
            continue;
        }

        const targetParentId =
            sourceFolder.parent_id === null ||
            sourceFolder.parent_id === undefined
                ? null
                : (copyMaps.assetFolderIds.get(
                      Number(sourceFolder.parent_id),
                  ) ?? null);
        const createdFolder = await managementApi.assets.createAssetFolder(
            {
                spaceId: targetSpace,
                payload: {
                    name: String(sourceFolder.name),
                    parent_id: targetParentId,
                },
            },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );
        const targetFolder = createdFolder.asset_folder;
        const entry: CopyAssetFolderManifestEntry = {
            type: "asset_folder",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: folderNode.sourceId,
            target_id: Number(targetFolder.id),
            source_name: String(sourceFolder.name ?? ""),
            target_name: String(targetFolder.name ?? ""),
            source_parent_id: sourceFolder.parent_id ?? null,
            target_parent_id: targetFolder.parent_id ?? null,
            source_path: folderNode.sourcePath,
            target_path: folderNode.sourcePath,
            action: "created",
            created_at: createdAt,
        };

        await appendCopyManifestEntry({
            combinedPath: manifestPaths.combined,
            resourcePath: manifestPaths.assetFolders,
            entry,
        });
        copyMaps.assetFolderIds.set(entry.source_id, entry.target_id);
        folderNode.targetParentId = entry.target_parent_id;
        folderNode.action = "create";
        assetFoldersCreated += 1;
    }

    for (const asset of sourceAssets) {
        const graphAsset = graphAssetBySourceId.get(Number(asset.id));

        if (!graphAsset) {
            continue;
        }

        const mappedTargetAsset = copyMaps.assetIds.get(Number(asset.id));

        if (mappedTargetAsset) {
            graphAsset.targetFilename = mappedTargetAsset.filename;
            graphAsset.targetAssetFolderId =
                asset.asset_folder_id === null ||
                asset.asset_folder_id === undefined
                    ? null
                    : (copyMaps.assetFolderIds.get(
                          Number(asset.asset_folder_id),
                      ) ?? null);
            graphAsset.action = "match";
            assetsMatched += 1;
            continue;
        }

        const fileName = getFileName(asset.filename);
        const existingTargetAsset = findUniqueTargetAssetByFileName(
            targetAssets,
            fileName,
        );
        const targetAssetFolderId =
            asset.asset_folder_id === null ||
            asset.asset_folder_id === undefined
                ? null
                : (copyMaps.assetFolderIds.get(Number(asset.asset_folder_id)) ??
                  null);
        const createdAt = new Date().toISOString();

        if (existingTargetAsset) {
            const entry: CopyAssetManifestEntry = {
                type: "asset",
                source_space_id: sourceSpace,
                target_space_id: targetSpace,
                source_id: Number(asset.id),
                target_id: Number(existingTargetAsset.id),
                source_filename: asset.filename,
                target_filename: existingTargetAsset.filename,
                source_asset_folder_id: asset.asset_folder_id ?? null,
                target_asset_folder_id:
                    existingTargetAsset.asset_folder_id ?? null,
                action: "matched_by_target_key",
                created_at: createdAt,
            };

            await appendCopyManifestEntry({
                combinedPath: manifestPaths.combined,
                resourcePath: manifestPaths.assets,
                entry,
            });
            copyMaps.assetIds.set(entry.source_id, {
                id: entry.target_id,
                filename: entry.target_filename,
            });
            copyMaps.assetFilenames.set(
                entry.source_filename,
                entry.target_filename,
            );
            graphAsset.targetFilename = entry.target_filename;
            graphAsset.targetAssetFolderId = entry.target_asset_folder_id;
            graphAsset.action = "match";
            assetsMatched += 1;
            continue;
        }

        const pathToFile = await managementApi.assets.downloadAsset(
            { payload: asset },
            apiConfig,
        );
        const targetAsset = await managementApi.assets.createAssetAndFinalize(
            {
                spaceId: targetSpace,
                pathToFile,
                payload: {
                    filename: asset.filename,
                    asset_folder_id: targetAssetFolderId,
                },
            },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );

        if (Object.keys(getAssetMetadataPayload(asset)).length > 0) {
            await managementApi.assets.updateAsset(
                {
                    spaceId: targetSpace,
                    assetId: Number(targetAsset.id),
                    payload: getAssetMetadataPayload(asset),
                },
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );
        }

        const entry: CopyAssetManifestEntry = {
            type: "asset",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: Number(asset.id),
            target_id: Number(targetAsset.id),
            source_filename: asset.filename,
            target_filename: targetAsset.filename,
            source_asset_folder_id: asset.asset_folder_id ?? null,
            target_asset_folder_id: targetAssetFolderId,
            action: "created",
            created_at: createdAt,
        };

        await appendCopyManifestEntry({
            combinedPath: manifestPaths.combined,
            resourcePath: manifestPaths.assets,
            entry,
        });
        copyMaps.assetIds.set(entry.source_id, {
            id: entry.target_id,
            filename: entry.target_filename,
        });
        copyMaps.assetFilenames.set(
            entry.source_filename,
            entry.target_filename,
        );
        graphAsset.targetFilename = entry.target_filename;
        graphAsset.targetAssetFolderId = entry.target_asset_folder_id;
        graphAsset.action = "create";
        assetsCreated += 1;
    }

    await dedupeManifestFile(manifestPaths.assetFolders);
    await dedupeManifestFile(manifestPaths.assets);
    await dedupeManifestFile(manifestPaths.combined);
    graph.limitations = [];

    const report = buildCopyAssetsApplyReport({
        sourceSpace,
        targetSpace,
        input,
        graph,
        manifestPaths,
        assetFoldersCreated,
        assetFoldersMatched,
        assetsCreated,
        assetsMatched,
    });

    if (outputPath) {
        await writeJsonReport(outputPath, report);
    }

    Logger.success(
        `Asset copy complete. Created ${assetsCreated} asset(s), matched ${assetsMatched} asset(s).`,
    );
    Logger.success(`Asset manifest written to ${manifestPaths.assets}`);
    Logger.success(
        `Asset folder manifest written to ${manifestPaths.assetFolders}`,
    );

    return report;
};

const logDryRunCopyPlan = async ({ report }: { report: CopyDryRunReport }) => {
    Logger.warning(
        "[dry-run] Copy stories preview only. No Storyblok writes will be made.",
    );
    Logger.warning(
        `[dry-run] Source space: ${report.normalized.sourceSpaceId}`,
    );
    Logger.warning(
        `[dry-run] Target space: ${report.normalized.targetSpaceId}`,
    );
    Logger.warning(`[dry-run] Source: ${report.normalized.source}`);
    Logger.warning(`[dry-run] Destination: ${report.normalized.destination}`);
    Logger.warning(`[dry-run] Mode: ${report.normalized.mode}`);
    Logger.warning(
        `[dry-run] With assets: ${report.normalized.withAssets ? "yes" : "no"}`,
    );

    if (report.normalized.mode === "children") {
        Logger.warning(
            "[dry-run] Source folder root will not be created; only descendants are planned.",
        );
    }

    if (report.normalized.mode === "self") {
        Logger.warning(
            "[dry-run] Descendants will not be copied; only the selected story or folder shell is planned.",
        );
    }

    Logger.warning(
        `[dry-run] Would create ${report.items.length} story/folder item(s):`,
    );

    for (const item of report.items) {
        Logger.warning(
            `[dry-run]   ${item.type.padEnd(6)} ${item.targetFullSlug || "<root>"}`,
        );
    }

    if (report.graph) {
        Logger.warning(
            `[dry-run] Would plan ${report.summary.assetFolders} referenced asset folder(s) and ${report.summary.assets} referenced asset(s).`,
        );
        Logger.warning(
            `[dry-run] Asset refs: ${report.summary.assetReferencesMapped} mapped, ${report.summary.assetReferencesPlanned} planned, ${report.summary.assetReferencesUnresolved} unresolved.`,
        );
        Logger.warning(
            `[dry-run] Story refs: ${report.summary.storyReferencesMapped} mapped, ${report.summary.storyReferencesPreserved} preserved, ${report.summary.storyReferencesUnresolved} unresolved.`,
        );

        for (const folder of report.graph.assetFolders) {
            Logger.warning(
                `[dry-run]   asset_folder ${folder.action.padEnd(6)} ${folder.targetPath ?? `#${folder.sourceId}`}`,
            );
        }

        for (const asset of report.graph.assets) {
            Logger.warning(
                `[dry-run]   asset ${asset.action.padEnd(6)} ${asset.targetFilename}`,
            );
        }

        for (const reference of report.graph.assetReferences) {
            Logger.warning(
                `[dry-run]   asset_ref ${reference.status.padEnd(10)} ${reference.filename ?? reference.assetId ?? "<unknown>"} at ${reference.sourceStoryFullSlug ?? reference.path}`,
            );
        }
    }

    report.warnings.forEach((warning) =>
        Logger.warning(`[dry-run] ${warning.message}`),
    );
};

const logDryRunCopyAssetsPlan = async ({
    report,
}: {
    report: CopyAssetsDryRunReport;
}) => {
    Logger.warning(
        "[dry-run] Copy assets preview only. No Storyblok writes will be made.",
    );
    Logger.warning(
        `[dry-run] Source space: ${report.normalized.sourceSpaceId}`,
    );
    Logger.warning(
        `[dry-run] Target space: ${report.normalized.targetSpaceId}`,
    );
    Logger.warning("[dry-run] Selection: all assets and asset folders");
    Logger.warning(
        `[dry-run] Would plan ${report.summary.assetFolders} asset folder(s) and ${report.summary.assets} asset(s).`,
    );

    for (const folder of report.graph.assetFolders) {
        Logger.warning(
            `[dry-run]   asset_folder ${folder.targetPath ?? `#${folder.sourceId}`}`,
        );
    }

    for (const asset of report.graph.assets) {
        Logger.warning(`[dry-run]   asset ${asset.targetFilename}`);
    }

    report.graph.warnings.forEach((warning) =>
        Logger.warning(`[dry-run] ${warning.message}`),
    );

    report.limitations.forEach((limitation) =>
        Logger.warning(`[dry-run] limitation: ${limitation}`),
    );
};

export const copyCommand = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case COPY_COMMANDS.stories: {
            const sourceSpace = getCopySpace(
                flags,
                ["from", "sourceSpace"],
                apiConfig.spaceId,
            );
            const targetSpace = getCopySpace(
                flags,
                ["to", "targetSpace"],
                apiConfig.spaceId,
            );
            const selection = resolveCopySelection(flags);
            const dryRun = Boolean(flags["dryRun"]);
            const outputPath = readStringFlag(flags, ["outputPath"]);
            const manifestRoot = readStringFlag(flags, ["manifestRoot"]);
            const withAssets = Boolean(
                flags["withAssets"] ?? flags["with-assets"],
            );
            const destination = readStringFlag(flags, ["destination", "where"]);
            const destinationParentId = await resolveDestinationParentId(
                destination,
                targetSpace,
            );

            Logger.warning(
                `Copying stories from space '${sourceSpace}' to space '${targetSpace}'.`,
            );
            Logger.log(
                `Source '${selection.source}', mode '${selection.mode}', destination '${destination ?? "root"}'.`,
            );

            const sourceStories = await getStoriesForSelection(
                selection,
                sourceSpace,
            );
            const normalizedStories = normalizeStoriesForTree(
                sourceStories,
                selection,
            );
            const tree = createTree(normalizedStories);
            const rootsToCreate = prepareTreeForCreate(
                selectTreeRoots(tree, selection),
            );

            if (rootsToCreate.length === 0) {
                Logger.warning("No stories matched the copy selection.");
                break;
            }

            const plan = buildCopyPlan(rootsToCreate, destination);
            const manifestPaths = getDefaultCopyManifestPaths({
                sourceSpaceId: sourceSpace,
                targetSpaceId: targetSpace,
                rootDir: manifestRoot,
            });
            const manifestEntries = await loadManifest(manifestPaths.combined);
            const copyMaps = buildCopyMaps(manifestEntries);
            let dryRunGraph: CopyGraph | undefined;
            let withAssetsGraph: CopyGraph | undefined;
            let sourceAssets: any[] = [];
            let sourceAssetFolders: any[] = [];

            if (dryRun || withAssets) {
                const schemasPromise =
                    buildComponentSchemaRegistry(sourceSpace);

                if (withAssets) {
                    const [schemas, assetsResult, assetFoldersResult] =
                        await Promise.all([
                            schemasPromise,
                            managementApi.assets.getAllAssets(
                                { spaceId: sourceSpace },
                                {
                                    ...apiConfig,
                                    spaceId: sourceSpace,
                                },
                            ),
                            managementApi.assets.getAllAssetFolders(
                                { spaceId: sourceSpace },
                                {
                                    ...apiConfig,
                                    spaceId: sourceSpace,
                                },
                            ),
                        ]);

                    sourceAssets = Array.isArray(assetsResult?.assets)
                        ? assetsResult.assets
                        : [];
                    sourceAssetFolders = Array.isArray(
                        assetFoldersResult?.asset_folders,
                    )
                        ? assetFoldersResult.asset_folders
                        : [];
                    withAssetsGraph = buildReferencedAssetsGraph({
                        sourceSpace,
                        targetSpace,
                        selection,
                        destination,
                        plan,
                        sourceStories,
                        sourceAssets,
                        sourceAssetFolders,
                        schemas,
                        copyMaps,
                    });
                    dryRunGraph = withAssetsGraph;
                } else if (dryRun) {
                    const schemas = await schemasPromise;
                    dryRunGraph = buildStoryReferenceDryRunGraph({
                        sourceSpace,
                        targetSpace,
                        selection,
                        destination,
                        plan,
                        sourceStories,
                        schemas,
                        copyMaps,
                    });
                }
            }

            if (dryRun) {
                const conflicts = await findTargetConflicts(plan, targetSpace);
                const report = buildCopyDryRunReport({
                    sourceSpace,
                    targetSpace,
                    selection,
                    destination,
                    withAssets,
                    input: { ...flags },
                    plan,
                    conflicts,
                    graph: dryRunGraph,
                    outputPath,
                });

                await logDryRunCopyPlan({ report });

                if (outputPath) {
                    await writeDryRunReport(outputPath, report);
                }

                break;
            }

            if (withAssetsGraph) {
                Logger.warning(
                    "Copying referenced assets before stories because --with-assets was passed.",
                );
                await copyAssetsAndWriteManifests({
                    sourceSpace,
                    targetSpace,
                    input: { ...flags },
                    graph: withAssetsGraph,
                    sourceAssets,
                    sourceAssetFolders,
                    manifestRoot,
                });
            }

            await createStoriesAndWriteManifests({
                tree: rootsToCreate,
                realParentId: destinationParentId,
                sourceStoryById: buildSourceStoryById(sourceStories),
                targetSlugBySourceSlug: buildTargetSlugBySourceSlug(plan),
                sourceSpace,
                targetSpace,
                manifestRoot,
            });
            await rewriteCopiedStoryContents({
                sourceStories,
                sourceSpace,
                targetSpace,
                manifestRoot,
            });

            break;
        }
        case COPY_COMMANDS.assets: {
            const sourceSpace = getCopySpace(
                flags,
                ["from", "sourceSpace"],
                apiConfig.spaceId,
            );
            const targetSpace = getCopySpace(
                flags,
                ["to", "targetSpace"],
                apiConfig.spaceId,
            );
            const dryRun = Boolean(flags["dryRun"]);
            const outputPath = readStringFlag(flags, ["outputPath"]);
            const manifestRoot = readStringFlag(flags, ["manifestRoot"]);

            if (!flags["all"]) {
                throw new Error(
                    "copy assets currently requires --all. Referenced-asset selectors are planned for a later slice.",
                );
            }

            Logger.warning(
                dryRun
                    ? `Planning asset copy from space '${sourceSpace}' to space '${targetSpace}'.`
                    : `Preparing asset copy from space '${sourceSpace}' to space '${targetSpace}'.`,
            );

            const [assetsResult, assetFoldersResult] = await Promise.all([
                managementApi.assets.getAllAssets(
                    { spaceId: sourceSpace },
                    {
                        ...apiConfig,
                        spaceId: sourceSpace,
                    },
                ),
                managementApi.assets.getAllAssetFolders(
                    { spaceId: sourceSpace },
                    {
                        ...apiConfig,
                        spaceId: sourceSpace,
                    },
                ),
            ]);

            const sourceAssets = Array.isArray(assetsResult?.assets)
                ? assetsResult.assets
                : [];
            const sourceAssetFolders = Array.isArray(
                assetFoldersResult?.asset_folders,
            )
                ? assetFoldersResult.asset_folders
                : [];

            const graph = buildCopyAssetsGraph({
                sourceSpaceId: sourceSpace,
                targetSpaceId: targetSpace,
                assets: sourceAssets,
                assetFolders: sourceAssetFolders,
            });
            if (dryRun) {
                const report = buildCopyAssetsDryRunReport({
                    sourceSpace,
                    targetSpace,
                    input: { ...flags },
                    outputPath,
                    graph,
                });

                await logDryRunCopyAssetsPlan({ report });

                if (outputPath) {
                    await writeDryRunReport(outputPath, report);
                }

                break;
            }

            await copyAssetsAndWriteManifests({
                sourceSpace,
                targetSpace,
                input: { ...flags },
                graph,
                sourceAssets,
                sourceAssetFolders,
                outputPath,
                manifestRoot,
            });

            break;
        }
        default:
            Logger.warning(
                "Unsupported copy command. Use: sb-mig copy stories --from <sourceSpaceId> --to <targetSpaceId> --source <full_slug> --destination <target_folder>, or sb-mig copy assets --from <sourceSpaceId> --to <targetSpaceId> --all --dry-run",
            );
    }
};
