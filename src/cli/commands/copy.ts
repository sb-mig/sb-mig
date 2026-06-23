import type { CLIOptions } from "../../utils/interfaces.js";

import fs from "fs/promises";
import path from "path";

import { managementApi } from "../../api/managementApi.js";
import { createTree, traverseAndCreate } from "../../api/stories/tree.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";

const COPY_COMMANDS = {
    stories: "stories",
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
    };
    summary: {
        plannedCreates: number;
        folders: number;
        stories: number;
        conflicts: number;
        warnings: number;
        errors: number;
    };
    items: CopyPlanItem[];
    warnings: CopyPlanWarning[];
    errors: any[];
    limitations: string[];
    commands: {
        dryRun: string;
        apply: string;
    };
};

const COPY_DRY_RUN_LIMITATIONS = [
    "assets_not_copied",
    "asset_fields_not_rewritten",
    "story_references_not_rewritten",
    "create_only",
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

const buildDryRunWarnings = (conflicts: CopyPlanItem[]): CopyPlanWarning[] => [
    ...conflicts.map((conflict) => ({
        code: "target_exists",
        message: `Target ${conflict.type} already exists at '${conflict.targetFullSlug}'. Current copy is create-only, so the real copy may fail.`,
        targetFullSlug: conflict.targetFullSlug,
    })),
    {
        code: "assets_not_copied",
        message: "Assets are not copied by this command yet.",
    },
    {
        code: "references_not_rewritten",
        message: "Asset fields and story references are not rewritten yet.",
    },
];

const quoteCommandArg = (value: string): string =>
    /^[a-zA-Z0-9_./:-]+$/.test(value) ? value : JSON.stringify(value);

const buildCopyCommand = ({
    sourceSpace,
    targetSpace,
    selection,
    destination,
    dryRun,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
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
    input,
    plan,
    conflicts,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    input: Record<string, any>;
    plan: CopyPlanItem[];
    conflicts: CopyPlanItem[];
    outputPath?: string;
}): CopyDryRunReport => {
    const items = withConflictFlags(plan, conflicts);
    const warnings = buildDryRunWarnings(conflicts);

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
        },
        summary: {
            plannedCreates: items.length,
            folders: items.filter((item) => item.type === "folder").length,
            stories: items.filter((item) => item.type === "story").length,
            conflicts: conflicts.length,
            warnings: warnings.length,
            errors: 0,
        },
        items,
        warnings,
        errors: [],
        limitations: COPY_DRY_RUN_LIMITATIONS,
        commands: {
            dryRun: buildCopyCommand({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                dryRun: true,
                outputPath,
            }),
            apply: buildCopyCommand({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                dryRun: false,
            }),
        },
    };
};

const writeDryRunReport = async (
    outputPath: string,
    report: CopyDryRunReport,
) => {
    const outputDirectory = path.dirname(outputPath);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    Logger.success(`[dry-run] Copy plan written to ${outputPath}`);
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

    report.warnings.forEach((warning) =>
        Logger.warning(`[dry-run] ${warning.message}`),
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

            if (dryRun) {
                const plan = buildCopyPlan(rootsToCreate, destination);
                const conflicts = await findTargetConflicts(plan, targetSpace);
                const report = buildCopyDryRunReport({
                    sourceSpace,
                    targetSpace,
                    selection,
                    destination,
                    input: { ...flags },
                    plan,
                    conflicts,
                    outputPath,
                });

                await logDryRunCopyPlan({ report });

                if (outputPath) {
                    await writeDryRunReport(outputPath, report);
                }

                break;
            }

            await traverseAndCreate(
                {
                    tree: rootsToCreate as any,
                    realParentId: destinationParentId,
                    spaceId: targetSpace,
                },
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );

            break;
        }
        default:
            console.log(`no command like that: ${command}`);
    }
};
