import type {
    CopyGraph,
    CopyMaps,
    CopyRelinkMatch,
    CopyRelinkAssetMapping,
    CopyRelinkPlanItem,
    CopyRelinkStoryMapping,
    CopyRelinkStoryRewrite,
    CopyAssetFolderManifestEntry,
    CopyAssetManifestEntry,
    CopyInternalTagManifestEntry,
    CopyComponentSchemaRegistry,
    CopyManifestEntry,
    CopyManifestFileInput,
    CopyManifestFileKind,
    CopyManifestPairInput,
    CopyManifestRemovalEntry,
    CopyManifestPaths,
    CopyManifestViewFilters,
    CopyResourceType,
    CopyStoryManifestEntry,
    CopyTranslatedSlugSummary,
} from "../../api/copy/index.js";
import type { PublicationMode } from "../../api/data-migration/component-data-migration.js";
import type { PublishedLayerRecord } from "../../api/data-migration/published-layer.js";
import type { PublishLanguagesOption } from "../../api/stories/stories.types.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import fs from "fs/promises";
import path from "path";

import {
    appendManifestEntry,
    applyStoryManifestEntryToMaps,
    archiveCopyManifests,
    buildCopyAssetsGraph,
    buildCopyMaps,
    buildCopyPlanGateSummary,
    buildCopyReferenceSelection,
    buildCopyRelinkClassificationMaps,
    buildCopyRelinkMaps,
    buildCopyRelinkPlanSummary,
    buildCopyTranslatedSlugsWarning,
    classifyStoryReferences,
    countStoryReferenceStatuses,
    createCopyGraph,
    createEmptyCopyMaps,
    dedupeManifestFile,
    describeBrokenStoryReferenceTarget,
    describeCopyTranslatedSlugs,
    formatCopyManifestInspection,
    formatCopyManifestPairList,
    formatCopyManifestRemovalPlan,
    formatCopyPlanGate,
    formatCopySpacePlanGate,
    buildCopySpacePlanGateSummary,
    parseCopySpaceOnly,
    formatCopyRelinkPlan,
    formatMissingPluginFailures,
    groupMissingPluginFailures,
    buildCopyManifestPairList,
    getCopyManifestRoot,
    getDefaultCopyManifestPaths,
    groupBrokenStoryReferences,
    inspectCopyManifests,
    assertCopyManifestPairPathIsSafe,
    isCopyResourceType,
    isKnownCopyLedgerFile,
    isSafeCopySpaceSegment,
    buildCopyManifestRemovalPlan,
    CopyManifestPathError,
    loadManifest,
    normalizeAssetFolderParentId,
    parseManifestJsonl,
    planCopyRelinkStoryRewrite,
    planStoryTranslatedSlugs,
    applyCopyMapWrites,
    assetKeyOf,
    getCopyMapWrites,
    getCopyAssetMapWrites,
    rewriteCopyReferences,
    scanStoriesReferences,
    selectRelinkLedgerAssetMappings,
    selectRelinkLedgerStoryMappings,
    summarizeCopyGraph,
    summarizeCopyTranslatedSlugs,
    findSchemaDrift,
    formatSchemaDriftLines,
    formatStoriesWillFailLine,
    summarizeStoriesWillFail,
} from "../../api/copy/index.js";
import {
    resolveCopySpaceConcurrency,
    runCopySpace,
} from "../../api/copy/space-apply.js";
import {
    buildPublishedLayerContext,
    resolveStoryLayerState,
} from "../../api/data-migration/published-layer.js";
import { managementApi } from "../../api/managementApi.js";
import {
    parsePublishLanguagesOption,
    resolvePublishLanguageCodes,
} from "../../api/stories/stories.js";
import { createTree } from "../../api/stories/tree.js";
import { mapWithConcurrency } from "../../utils/async-utils.js";
import Logger from "../../utils/logger.js";
import {
    createProgress,
    resolveProgressMode,
    type Progress,
    type ProgressMode,
    type ProgressOutcome,
    type ProgressModePreference,
} from "../../utils/progress.js";
import { getFileName } from "../../utils/string-utils.js";
import { apiConfig } from "../api-config.js";
import { askYesNo } from "../helpers.js";

const COPY_COMMANDS = {
    stories: "stories",
    assets: "assets",
    relink: "relink",
    manifests: "manifests",
    space: "space",
};

const COPY_MODES = ["subtree", "children", "self"] as const;
const TARGET_CONFLICT_CHECK_CONCURRENCY = 10;

type CopyMode = (typeof COPY_MODES)[number];

type CopyPublicationOptions = {
    mode: PublicationMode;
    publishLanguages?: PublishLanguagesOption;
    resolvedPublishLanguages?: string[];
};

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
    /** What the ledger's mapping for this item resolves to, when it has one. */
    ledger?: CopyLedgerMatch;
    /** What the apply run did with this item. Absent on a dry-run. */
    outcome?: CopyItemOutcome;
    targetId?: number;
};

/**
 * What happened to one item in an apply run, readable from the report without
 * parsing stdout. `updated`, `published` and `publish_skipped` mean the target
 * holds the item's content; `created` and `matched` mean only its shell was
 * reached; `update_failed`, `create_failed` and `skipped_parent_failed` mean
 * its content is not there.
 */
type CopyItemOutcome =
    | "created"
    | "matched"
    | "updated"
    | "update_failed"
    | "create_failed"
    | "skipped_parent_failed"
    | "published"
    | "publish_skipped";

type CopyOutcomeRecord = { outcome: CopyItemOutcome; targetId?: number };

/**
 * One failed write, collected so the run carries on past it. Stories are named
 * by `path` (source full_slug), assets and asset folders by `name`. A `run`
 * failure is an unexpected error that stopped the writes early.
 */
type CopyRunFailure = {
    resource: "story" | "asset" | "asset_folder" | "run";
    path?: string;
    name?: string;
    phase: "create" | "update" | "publish" | "unexpected";
    status?: number;
    message: string;
    sourceId?: number;
    targetId?: number;
};

/**
 * A ledger mapping checked against the target the way `copy relink` checks
 * one: by id. `matched` lives at the planned path, `moved` lives elsewhere and
 * is kept, `missing` no longer exists and is created again. A story in
 * Storyblok's trash still answers the by-id read; it is `missing`, with the
 * time it was trashed.
 */
type CopyLedgerMatch = {
    match: "matched" | "moved" | "missing";
    targetId: number;
    currentFullSlug?: string;
    deletedAt?: string;
};

type CopyAssetsSelection =
    | {
          type: "all";
      }
    | {
          type: "asset";
          values: string[];
      }
    | {
          type: "asset_folder";
          values: string[];
      }
    | {
          type: "referenced_by_stories";
          storySelection: CopySelection;
      };

type CopyAssetsSelectionReport =
    | "all"
    | {
          type: "asset" | "asset_folder";
          values: string[];
      }
    | {
          type: "referenced_by_stories";
          source: string;
          mode: CopyMode;
      };

type CopyPlanWarning = {
    code: string;
    message: string;
    targetFullSlug?: string;
};

type CopyDryRunAssetReferenceBucket = {
    occurrences: number;
    uniqueAssets: number;
};

type CopyDryRunForeignAssetSpaceSummary = {
    spaceId: string;
    occurrences: number;
    uniqueAssets: number;
};

type CopyDryRunAssetReferenceSummary = {
    mapped: CopyDryRunAssetReferenceBucket;
    planned: CopyDryRunAssetReferenceBucket;
    unresolved: CopyDryRunAssetReferenceBucket;
    unsupported: CopyDryRunAssetReferenceBucket;
    /**
     * How the stories hold their references: as an asset object, or as a URL
     * written into a text, HTML, link or plugin field.
     */
    byShape: {
        object: CopyDryRunAssetReferenceBucket;
        string: CopyDryRunAssetReferenceBucket;
    };
    foreignAssetSpaces: CopyDryRunForeignAssetSpaceSummary[];
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
        /** Every selection, when the run was given more than one. */
        selections?: CopySelection[];
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
        storyReferencesWillRelink: number;
        storyReferencesWillBreak: number;
        storyReferencesExternalKept: number;
        storyReferencesUnresolved: number;
        conflicts: number;
        warnings: number;
        errors: number;
        componentIssues: number;
        /** Field values whose shape the target's field type rejects. */
        schemaDriftOccurrences: number;
        /** Stories the target will reject on write: schema drift only. */
        storiesWillFail: number;
    };
    translatedSlugs: CopyTranslatedSlugSummary;
    items: CopyPlanItem[];
    graph?: CopyGraph;
    assetReferenceSummary?: CopyDryRunAssetReferenceSummary;
    componentCompatibility?: CopyDryRunComponentCompatibility;
    schemaDrift?: ReturnType<typeof findSchemaDrift>;
    willFail?: ReturnType<typeof summarizeStoriesWillFail>;
    warnings: CopyPlanWarning[];
    errors: any[];
    /** Always empty: a dry-run writes nothing. Present so every report has it. */
    failures: CopyRunFailure[];
    limitations: string[];
    commands: {
        dryRun: string;
        apply: string;
    };
};

type CopyDryRunComponentCompatibility = {
    checked: boolean;
    missingComponents: string[];
    disallowedInFieldComponents: string[];
    findings: ComponentCompatibilityFinding[];
};

/**
 * What the run can do about the tags of the assets it touches: the tags the
 * target already has, the names a person must create there, and how many
 * assets are waiting on them.
 */
type CopyInternalTagsReport = {
    matched: string[];
    missing: string[];
    assetsWithMissingTags: number;
};

/**
 * The PLAN's internal-tag line, or nothing when no selected asset carries a
 * tag. The missing names are the point: they are what a person has to create
 * in Storyblok before a rerun can attach them.
 */
const formatInternalTagsPlanLine = (
    tags: CopyInternalTagsReport,
    targetSpace: string,
): string | undefined => {
    if (tags.matched.length === 0 && tags.missing.length === 0) {
        return undefined;
    }

    const head = `  internal tags: ${tags.matched.length} matched, ${tags.missing.length} missing in space ${targetSpace}`;

    return tags.missing.length === 0
        ? head
        : `${head} — create them in Storyblok (Assets → Tags) and rerun: ${tags.missing.join(", ")}`;
};

const toInternalTagsReport = (
    plan: CopyInternalTagPlan,
): CopyInternalTagsReport => ({
    matched: plan.matched
        .map((tag) => tag.name)
        .sort((left, right) => left.localeCompare(right, "en")),
    missing: plan.missing,
    assetsWithMissingTags: plan.assetsWithMissingTags,
});

type CopyAssetsDryRunReport = {
    schemaVersion: 1;
    command: "copy assets";
    dryRun: true;
    generatedAt: string;
    input: Record<string, any>;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        selection: CopyAssetsSelectionReport;
    };
    summary: {
        plannedCreates: number;
        assetFolders: number;
        assets: number;
        warnings: number;
        errors: number;
    };
    internalTags: CopyInternalTagsReport;
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
        selection: CopyAssetsSelectionReport;
    };
    summary: {
        assetFoldersCreated: number;
        assetFoldersMatched: number;
        assetsCreated: number;
        assetsMatched: number;
        warnings: number;
        errors: number;
        outcomes: Record<CopyItemOutcome, number>;
        failed: number;
    };
    internalTags: CopyInternalTagsReport;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    /** One line per asset folder and asset, in write order, with what happened to it. */
    items: CopyAssetsApplyItem[];
    failures: CopyRunFailure[];
    manifestPaths: {
        assets: string;
        assetFolders: string;
        combined: string;
    };
    warnings: any[];
    errors: any[];
};

type CopyAssetsApplyItem = {
    resource: "asset_folder" | "asset";
    sourceId: number;
    name: string;
    targetId?: number;
    outcome: CopyItemOutcome;
};

type CopyStoriesApplySummary = {
    storyFoldersPlanned: number;
    storiesPlanned: number;
    storiesCreated: number;
    storiesMatched: number;
    /** Shells the target refused to create, with no story at their path to adopt. */
    storiesCreateFailed: number;
    /** Items under a failed create, never attempted: they had no parent. */
    storiesSkippedParentFailed: number;
};

type CopyStoriesApplyReport = {
    schemaVersion: 1;
    command: "copy stories";
    dryRun: false;
    generatedAt: string;
    input: Record<string, any>;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        source: string;
        destination: string;
        mode: CopyMode;
        withAssets: boolean;
        /** Every selection, when the run was given more than one. */
        selections?: CopySelection[];
    };
    summary: CopyStoriesApplySummary & {
        assetFoldersCreated?: number;
        assetFoldersMatched?: number;
        assetsCreated?: number;
        assetsMatched?: number;
        warnings: number;
        errors: number;
        /** How many planned items ended in each outcome. */
        outcomes: Record<CopyItemOutcome, number>;
        /** Failed writes, stories and --with-assets assets together. */
        failed: number;
    };
    translatedSlugs: CopyTranslatedSlugSummary;
    /** The plan, each item carrying its `outcome` and `targetId`. */
    items: CopyPlanItem[];
    failures: CopyRunFailure[];
    graph?: CopyGraph;
    assetCopy?: CopyAssetsApplyReport;
    manifestPaths: {
        stories: string;
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

const readStringListFlag = (
    flags: Record<string, any>,
    names: string[],
): string[] => {
    const values: string[] = [];

    for (const name of names) {
        const value = flags[name];

        if (Array.isArray(value)) {
            values.push(...value.map(String));
            continue;
        }

        if (value !== undefined && value !== null && value !== "") {
            values.push(String(value));
        }
    }

    return values
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
};

const getCopySpace = (
    flags: Record<string, any>,
    names: string[],
    fallback: string,
): string => readStringFlag(flags, names) ?? fallback;

const parseCopyPublicationMode = (
    publicationModeFlag: string | undefined,
): PublicationMode => {
    if (!publicationModeFlag) {
        return "preserve-layers";
    }

    if (
        publicationModeFlag === "preserve-layers" ||
        publicationModeFlag === "collapse-draft" ||
        publicationModeFlag === "save-only"
    ) {
        return publicationModeFlag;
    }

    throw new Error(
        "--publicationMode must be one of: preserve-layers, collapse-draft, save-only.",
    );
};

const resolveCopyPublicationOptions = async ({
    flags,
    targetSpace,
    dryRun,
}: {
    flags: Record<string, any>;
    targetSpace: string;
    dryRun: boolean;
}): Promise<CopyPublicationOptions> => {
    const mode = parseCopyPublicationMode(
        readStringFlag(flags, ["publicationMode", "publication-mode"]),
    );
    const publicationLanguagesFlag = readStringFlag(flags, [
        "publicationLanguages",
        "publication-languages",
    ]);

    if (mode === "save-only" && publicationLanguagesFlag) {
        throw new Error(
            "--publicationLanguages cannot be used with --publicationMode save-only.",
        );
    }

    if (mode === "save-only") {
        return { mode };
    }

    const publishLanguages = publicationLanguagesFlag
        ? parsePublishLanguagesOption(publicationLanguagesFlag)
        : "all";

    return {
        mode,
        publishLanguages,
        resolvedPublishLanguages: dryRun
            ? undefined
            : await resolvePublishLanguageCodes(publishLanguages, {
                  ...apiConfig,
                  spaceId: targetSpace,
              }),
    };
};

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

const normalizeAssetFolderPath = (folderPath: string): string =>
    folderPath.replace(/^\/+|\/+$/g, "");

const toSelectionReport = (
    selection: CopyAssetsSelection,
): CopyAssetsSelectionReport =>
    selection.type === "all"
        ? "all"
        : selection.type === "referenced_by_stories"
          ? {
                type: "referenced_by_stories",
                source: selection.storySelection.source,
                mode: selection.storySelection.mode,
            }
          : {
                type: selection.type,
                values: selection.values,
            };

const resolveCopyAssetsSelection = (
    flags: Record<string, any>,
): CopyAssetsSelection => {
    const assetValues = readStringListFlag(flags, ["asset", "assetId"]);
    const assetFolderValues = readStringListFlag(flags, [
        "assetFolder",
        "asset-folder",
        "assetFolderId",
        "asset-folder-id",
    ]);
    const hasAll = Boolean(flags["all"]);
    const hasReferencedByStories = Boolean(
        flags["referencedByStories"] ?? flags["referenced-by-stories"],
    );
    const selectorCount =
        (hasAll ? 1 : 0) +
        (assetValues.length > 0 ? 1 : 0) +
        (assetFolderValues.length > 0 ? 1 : 0) +
        (hasReferencedByStories ? 1 : 0);

    if (selectorCount === 0) {
        throw new Error(
            "copy assets requires one selector: --all, --asset <id|url|unique-name>, --assetFolder <id|path>, or --referenced-by-stories --source <full_slug>.",
        );
    }

    if (selectorCount > 1) {
        throw new Error(
            "copy assets accepts only one selector family at a time. Use --all, --asset, --assetFolder, or --referenced-by-stories.",
        );
    }

    if (hasReferencedByStories) {
        return {
            type: "referenced_by_stories",
            storySelection: resolveCopySelection(flags),
        };
    }

    if (assetValues.length > 0) {
        return {
            type: "asset",
            values: assetValues,
        };
    }

    if (assetFolderValues.length > 0) {
        return {
            type: "asset_folder",
            values: assetFolderValues.map(normalizeAssetFolderPath),
        };
    }

    return {
        type: "all",
    };
};

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

/** The `--source` value that means every root of the source space. */
const WHOLE_SPACE_SOURCE = "/";

/** A root of the source space, as the expansion of `/` found it. */
type SourceRootItem = { full_slug: string; is_folder: boolean };

/** What `/` turned out to mean, once the roots were read. */
type WholeSpaceExpansion = {
    roots: SourceRootItem[];
    excluded: SourceRootItem[];
};

/**
 * What `/` meant, for the report: `normalized.source` stays `/`, so the
 * expanded roots are stated next to it rather than folded into it.
 */
const buildRootExpansionReport = (expansion?: WholeSpaceExpansion) =>
    expansion
        ? {
              roots: expansion.roots.map((root) => root.full_slug),
              ...(expansion.excluded.length > 0
                  ? {
                        excluded: expansion.excluded.map(
                            (root) => root.full_slug,
                        ),
                    }
                  : {}),
          }
        : {};

const isWholeSpaceSelection = (selection: CopySelection): boolean =>
    selection.source === WHOLE_SPACE_SOURCE;

/** `blog/` for a folder, `about` for a story. */
const formatRootItem = (root: SourceRootItem): string =>
    root.is_folder ? `${root.full_slug}/` : root.full_slug;

/** A root name is accepted with any number of trailing slashes. */
const normalizeRootName = (value: string): string => value.replace(/\/+$/, "");

/**
 * Every `--source` (or legacy `--what`) value, repeated or comma-separated, as
 * its own selection. `/` is every root of the source space; `x/*` is the
 * children of x; any other value takes `--mode`. Order is kept, and a value
 * given twice is planned once.
 */
const resolveCopySelections = (flags: Record<string, any>): CopySelection[] => {
    const sourceValues = readStringListFlag(flags, ["source"]);
    const rawValues = (
        sourceValues.length > 0
            ? sourceValues
            : readStringListFlag(flags, ["what"])
    )
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        // The children of the space root are its roots, so '/*' is '/'.
        .map((value) =>
            value === `${WHOLE_SPACE_SOURCE}*` ? WHOLE_SPACE_SOURCE : value,
        )
        .filter((value) => value.length > 0);

    if (rawValues.length === 0) {
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
    const selections: CopySelection[] = [];
    const seen = new Set<string>();

    // Refused here, before a single read: '/' already is everything under the
    // space root, so 'children' could only mean the same thing or less.
    if (rawValues.includes(WHOLE_SPACE_SOURCE) && explicitMode === "children") {
        throw new Error(
            "--source / already means everything under the space root; --mode children cannot be combined with it.",
        );
    }

    for (const rawValue of rawValues) {
        const selection: CopySelection =
            rawValue !== WHOLE_SPACE_SOURCE && rawValue.endsWith("/*")
                ? {
                      source: rawValue.slice(0, -2),
                      mode: explicitMode ?? "children",
                  }
                : { source: rawValue, mode: explicitMode ?? "subtree" };
        const key = `${selection.mode} ${selection.source}`;

        if (!seen.has(key)) {
            seen.add(key);
            selections.push(selection);
        }
    }

    return selections;
};

/**
 * `--exclude` names roots to drop from `/`, repeated or comma-separated. It
 * says nothing about any other selector, so it is refused next to one.
 */
const resolveRootExcludes = (
    flags: Record<string, any>,
    selections: CopySelection[],
): string[] => {
    const values = readStringListFlag(flags, ["exclude"])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    if (values.length === 0) {
        return [];
    }

    if (!selections.some(isWholeSpaceSelection)) {
        throw new Error("--exclude only applies to --source /.");
    }

    const names = values.map(normalizeRootName);
    // Naming a root and excluding it in the same run contradicts itself, and
    // the expansion would keep it: the run must say so instead of choosing.
    const conflict = names.find((name) =>
        selections.some(
            (selection) =>
                !isWholeSpaceSelection(selection) &&
                normalizeRootName(selection.source) === name,
        ),
    );

    if (conflict) {
        throw new Error(
            `--exclude '${conflict}' is also given as --source; remove one.`,
        );
    }

    return names;
};

/**
 * The roots of a space: every story and folder with no parent. Storyblok's
 * `with_parent=0` answers exactly that, and the listing paginates, so a space
 * with more roots than one page is read whole. No other filter is passed:
 * `in_trash=false` alongside it returns trashed items too.
 */
const listSourceRootItems = async (
    sourceSpace: string,
): Promise<SourceRootItem[]> => {
    const rootStories = await managementApi.stories.getAllStories(
        {
            options: {
                with_parent: 0,
            },
        },
        {
            ...apiConfig,
            spaceId: sourceSpace,
        },
    );

    const listed = (rootStories ?? []).map((item: any) => item?.story ?? item);
    // A named source that cannot be read throws; '/' must not quietly select
    // less than the space holds, which is the miss this selector exists to end.
    const readable = listed.filter(
        (story: any) =>
            story?.full_slug !== undefined &&
            story?.full_slug !== null &&
            String(story.full_slug).length > 0,
    );

    if (readable.length !== listed.length) {
        throw new Error(
            `Could not read ${listed.length - readable.length} of ${listed.length} roots of space ${sourceSpace}.`,
        );
    }

    return readable
        .map((story: any) => ({
            full_slug: String(story.full_slug),
            is_folder: Boolean(story.is_folder),
        }))
        .sort((a: SourceRootItem, b: SourceRootItem) =>
            a.full_slug < b.full_slug ? -1 : a.full_slug > b.full_slug ? 1 : 0,
        );
};

/**
 * `/` becomes one selection per root, in `full_slug` order, so two runs plan
 * the same way. The expansion happens before the dedupe of the forest, so
 * `/,blog` plans exactly what `/` plans.
 */
const expandWholeSpaceSelections = async (
    selections: CopySelection[],
    excludes: string[],
    sourceSpace: string,
): Promise<{
    selections: CopySelection[];
    expansion?: WholeSpaceExpansion;
}> => {
    if (!selections.some(isWholeSpaceSelection)) {
        return { selections };
    }

    const rootItems = await listSourceRootItems(sourceSpace);

    if (rootItems.length === 0) {
        throw new Error(
            `Space ${sourceSpace} has no stories or folders to copy.`,
        );
    }

    const excluded: SourceRootItem[] = [];

    for (const value of excludes) {
        const match = rootItems.find((root) => root.full_slug === value);

        if (!match) {
            throw new Error(
                `--exclude '${value}' is not a root of space ${sourceSpace}. Roots: ${rootItems
                    .map(formatRootItem)
                    .join(", ")}.`,
            );
        }

        if (!excluded.includes(match)) {
            excluded.push(match);
        }
    }

    const excludedSlugs = new Set(excluded.map((root) => root.full_slug));
    const roots = rootItems.filter(
        (root) => !excludedSlugs.has(root.full_slug),
    );

    if (roots.length === 0) {
        throw new Error(
            `--exclude removed every root of space ${sourceSpace}; nothing is left to copy.`,
        );
    }
    const expanded: CopySelection[] = [];
    const seen = new Set<string>();

    for (const selection of selections) {
        const replacements = isWholeSpaceSelection(selection)
            ? roots.map((root) => ({
                  source: root.full_slug,
                  mode: selection.mode,
              }))
            : [selection];

        for (const replacement of replacements) {
            const key = `${replacement.mode} ${replacement.source}`;

            if (!seen.has(key)) {
                seen.add(key);
                expanded.push(replacement);
            }
        }
    }

    return { selections: expanded, expansion: { roots, excluded } };
};

/**
 * Several selections are planned as one forest. Each is read on its own, its
 * roots are concatenated in order and deduped by source story id: a root that
 * already sits inside another selection's tree is dropped, so a folder and a
 * story inside it plan the story once, under the folder. With one selection
 * this is exactly the tree that selection always produced.
 */
const collectSelectionForest = async (
    selections: CopySelection[],
    sourceSpace: string,
): Promise<{ sourceStories: any[]; roots: any[] }> => {
    const forests: { stories: any[]; roots: any[] }[] = [];

    for (const selection of selections) {
        const stories = await getStoriesForSelection(selection, sourceSpace);
        const tree = createTree(normalizeStoriesForTree(stories, selection));

        forests.push({ stories, roots: selectTreeRoots(tree, selection) });
    }

    if (forests.length === 1) {
        return {
            sourceStories: forests[0]!.stories,
            roots: forests[0]!.roots,
        };
    }

    const nodeId = (node: any) => Number(node?.id ?? node?.story?.id);
    const descendantIds = forests.map(({ roots }) => {
        const ids = new Set<number>();
        const visit = (node: any) => {
            for (const child of node?.children ?? []) {
                ids.add(nodeId(child));
                visit(child);
            }
        };

        roots.forEach(visit);

        return ids;
    });
    const roots: any[] = [];
    const plannedRootIds = new Set<number>();

    forests.forEach((forest, index) => {
        for (const root of forest.roots) {
            const id = nodeId(root);
            const insideAnotherSelection = descendantIds.some(
                (ids, other) => other !== index && ids.has(id),
            );

            if (plannedRootIds.has(id) || insideAnotherSelection) {
                continue;
            }

            plannedRootIds.add(id);
            roots.push(root);
        }
    });

    const storiesById = new Map<number, any>();

    for (const forest of forests) {
        for (const item of forest.stories) {
            const id = Number(item?.story?.id);

            if (!storiesById.has(id)) {
                storiesById.set(id, item);
            }
        }
    }

    return { sourceStories: [...storiesById.values()], roots };
};

/** `'blog' (mode 'subtree'), 'news' (mode 'children')` */
const describeCopySelections = (selections: CopySelection[]): string =>
    selections
        .map((selection) => `'${selection.source}' (mode '${selection.mode}')`)
        .join(", ");

/**
 * The single selection reports, graph scopes and commands have always
 * carried. Several values fold into it as the comma-separated `--source` that
 * reproduces the run, with `x/*` for a children selection.
 */
const toReportedSelection = (selections: CopySelection[]): CopySelection => {
    if (selections.length === 1) {
        return selections[0]!;
    }

    const plainMode =
        selections.find((selection) => selection.mode !== "children")?.mode ??
        "children";

    return {
        source: selections
            .map((selection) =>
                selection.mode === plainMode
                    ? selection.source
                    : `${selection.source}/*`,
            )
            .join(","),
        mode: plainMode,
    };
};

const formatRootCount = (count: number): string =>
    `${count} ${count === 1 ? "root" : "roots"}`;

/**
 * The PLAN lines for several selections; nothing for one. When `/` was given,
 * the run says what it meant: the count, then the roots themselves, then
 * whatever `--exclude` took out.
 */
const formatCopySelectionsLine = (
    selections: CopySelection[],
    plan: { type: "folder" | "story" }[],
    expansion?: WholeSpaceExpansion,
): string[] => {
    if (!expansion && selections.length < 2) {
        return [];
    }

    const folders = plan.filter((item) => item.type === "folder").length;
    const stories = plan.length - folders;
    const counts = `${stories} ${stories === 1 ? "story" : "stories"}, ${folders} ${folders === 1 ? "folder" : "folders"} after dedupe`;

    if (!expansion) {
        return [`  selections: ${selections.length} (${counts})`];
    }

    const lines = [
        `  selections: ${WHOLE_SPACE_SOURCE} -> ${formatRootCount(expansion.roots.length)} (${counts})`,
        `    ${expansion.roots.map(formatRootItem).join(", ")}`,
    ];

    if (expansion.excluded.length > 0) {
        lines.push(
            `    excluded: ${expansion.excluded.map(formatRootItem).join(", ")}`,
        );
    }

    return lines;
};

/** The line naming the sources, before the reads. */
const formatCopySourcesLine = ({
    selections,
    selection,
    destination,
    sourceSpace,
    expansion,
}: {
    selections: CopySelection[];
    selection: CopySelection;
    destination: string | undefined;
    sourceSpace: string;
    expansion?: WholeSpaceExpansion;
}): string => {
    if (expansion) {
        return `Sources: ${WHOLE_SPACE_SOURCE} -> ${formatRootCount(expansion.roots.length)} of space ${sourceSpace}, mode '${selection.mode}', destination '${destination ?? "root"}'.`;
    }

    return selections.length === 1
        ? `Source '${selection.source}', mode '${selection.mode}', destination '${destination ?? "root"}'.`
        : `Sources ${describeCopySelections(selections)}, destination '${destination ?? "root"}'.`;
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

const buildStoryShellPayload = (story: any, parentId: number | null) => {
    const component = story.content?.component;

    return {
        name: story.name,
        slug: resolveStorySlug(story),
        is_folder: story.is_folder === true,
        ...(parentId !== null ? { parent_id: parentId } : {}),
        ...(story.is_startpage === true && parentId !== null
            ? { is_startpage: true }
            : {}),
        ...(component
            ? {
                  content: {
                      _uid: "",
                      component,
                  },
              }
            : {}),
    };
};

const buildFinalStoryPayload = ({
    sourceStory,
    targetParentId,
    rewrittenContent,
    targetLanguageCodes,
}: {
    sourceStory: any;
    targetParentId: number | null;
    rewrittenContent: any;
    targetLanguageCodes?: string[];
}) => {
    const payload = stripGeneratedStoryFields(sourceStory);

    delete payload.full_slug;
    delete payload.parent_id;

    payload.slug = resolveStorySlug(sourceStory);
    payload.content = rewrittenContent;

    // Read as `translated_slugs`, written as `translated_slugs_attributes`.
    // Sending the read shape is what silently dropped them: the API takes the
    // key and ignores it.
    const translatedSlugs = planStoryTranslatedSlugs({
        story: sourceStory,
        targetLanguageCodes,
    });

    delete payload.translated_slugs;

    if (translatedSlugs.carried.length > 0) {
        payload.translated_slugs_attributes = translatedSlugs.carried;
    }

    if (targetParentId !== null) {
        payload.parent_id = targetParentId;
    }

    if (sourceStory.is_startpage === true && targetParentId !== null) {
        payload.is_startpage = true;
    }

    return payload;
};

const normaliseFullSlug = (value: unknown): string =>
    String(value ?? "").replace(/^\/+|\/+$/g, "");

const parentFullSlugOf = (fullSlug: string): string => {
    const index = fullSlug.lastIndexOf("/");

    return index === -1 ? "" : fullSlug.slice(0, index);
};

/**
 * Whether a target story lives at the path this copy planned for it. Paths are
 * compared without leading or trailing slashes, and a startpage matches its
 * folder's path: its `full_slug` is `folder/`, while the plan names it by its
 * own slug under that folder.
 */
const isStoryAtPlannedPath = (story: any, plannedFullSlug: string): boolean => {
    const actual = normaliseFullSlug(story?.full_slug);
    const planned = normaliseFullSlug(plannedFullSlug);

    return (
        actual === planned ||
        (story?.is_startpage === true && actual === parentFullSlugOf(planned))
    );
};

/**
 * Validates a ledger mapping with one by-id read, the way `copy relink` does:
 * the ledger records where a story was written, the target knows where it is
 * now. There is deliberately no second lookup by path. `with_slug` cannot
 * resolve a startpage (`folder/`), and re-checking the path through it used to
 * throw a valid mapping away and create a duplicate next to the story.
 *
 * A story found at a different path has moved: the mapping is kept and the
 * move is reported, never treated as stale.
 */
/**
 * Storyblok soft-deletes: a trashed story still answers `GET stories/:id` with
 * 200, its old `full_slug` and a `deleted_at`. For the copy it is gone.
 */
const isTrashedStory = (story: any): boolean =>
    story?.deleted_at !== undefined &&
    story?.deleted_at !== null &&
    story?.deleted_at !== "";

const getValidMappedTargetStory = async ({
    sourceStory,
    targetStoryId,
    targetFullSlug,
    targetSpace,
    trashedNote = "creating anew",
}: {
    sourceStory: any;
    targetStoryId: number;
    targetFullSlug?: string;
    targetSpace: string;
    /** What the caller does instead, said once when the target is trashed. */
    trashedNote?: string;
}) => {
    const targetStory = await managementApi.stories.getStoryById(
        String(targetStoryId),
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );

    if (targetStory?.story?.id && isTrashedStory(targetStory.story)) {
        Logger.warning(
            `Ledger mapping for '${sourceStory.full_slug ?? sourceStory.slug}' points at a deleted story (trashed ${targetStory.story.deleted_at}); ${trashedNote}.`,
        );

        return undefined;
    }

    if (targetStory?.story?.id) {
        if (
            targetFullSlug &&
            !isStoryAtPlannedPath(targetStory.story, targetFullSlug)
        ) {
            Logger.warning(
                `Ledger mapping for '${sourceStory.full_slug ?? sourceStory.slug}' points at target story '${targetStoryId}', which has moved from '${targetFullSlug}' to '${targetStory.story.full_slug}'. Keeping the mapping; nothing is created next to it.`,
            );
        }

        return targetStory.story;
    }

    Logger.warning(
        `Ignoring stale story manifest mapping for '${sourceStory.full_slug ?? sourceStory.slug}' because target story '${targetStoryId}' was not found in space '${targetSpace}'.`,
    );

    return undefined;
};

/**
 * Moves every planned path under `fromFullSlug` to sit under `toFullSlug`, so
 * the children of a story that moved are looked for where it lives now.
 */
const rebasePlannedTargetSlugs = (
    planned: Map<string, string>,
    fromFullSlug: string,
    toFullSlug: string,
) => {
    const from = normaliseFullSlug(fromFullSlug);
    const to = normaliseFullSlug(toFullSlug);

    if (!from || from === to) {
        return;
    }

    for (const [sourceFullSlug, targetFullSlug] of planned) {
        const normalised = normaliseFullSlug(targetFullSlug);

        if (normalised.startsWith(`${from}/`)) {
            planned.set(
                sourceFullSlug,
                `${to}${normalised.slice(from.length)}`,
            );
        }
    }
};

const describeCreateFailure = (result: any): string => {
    const status = result?.status
        ? `status ${result.status}`
        : "unknown status";
    const response = result?.response ? `: ${result.response}` : "";

    return `${status}${response}`;
};

/**
 * The story already living at a planned path, looked up with `by_slugs` so a
 * startpage (`folder/`) is found too. Used when a create fails: a `slug already
 * taken` means the story is there, and adopting it is the only answer that
 * neither crashes nor leaves a duplicate. Matches on `is_folder`, so a folder
 * and its startpage are never confused.
 */
const findTargetStoryAtPlannedPath = async ({
    plannedFullSlug,
    sourceStory,
    targetSpace,
}: {
    plannedFullSlug?: string;
    sourceStory: any;
    targetSpace: string;
}): Promise<any | undefined> => {
    const planned = normaliseFullSlug(plannedFullSlug);

    if (!planned) {
        return undefined;
    }

    const parent = parentFullSlugOf(planned);
    const candidates = await managementApi.stories.getStoriesByFullSlugs(
        [
            planned,
            `${planned}/`,
            ...(sourceStory?.is_startpage === true && parent
                ? [`${parent}/`]
                : []),
        ],
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );
    const isFolder = sourceStory?.is_folder === true;

    return (candidates ?? []).find(
        (story: any) =>
            story?.id &&
            story?.uuid &&
            (story.is_folder === true) === isFolder &&
            isStoryAtPlannedPath(story, planned),
    );
};

/**
 * Marks a node and everything under it as skipped, reporting each descendant.
 * A create that failed leaves its children with no parent to be created
 * under, so they are skipped explicitly rather than silently.
 */
const skipSubtree = (
    node: any,
    skipped: Set<number>,
    onSkippedDescendant: (fullSlug: string) => void,
): number => {
    let descendants = 0;

    const visit = (current: any, isRoot: boolean) => {
        const id = Number(current?.id ?? current?.story?.id);

        if (Number.isFinite(id)) {
            skipped.add(id);
        }

        if (!isRoot) {
            descendants += 1;
            onSkippedDescendant(
                String(current?.story?.full_slug ?? current?.story?.slug ?? id),
            );
        }

        for (const child of current?.children ?? []) {
            visit(child, false);
        }
    };

    visit(node, true);

    return descendants;
};

/**
 * Every planned item that has a ledger mapping, checked by id against the
 * target. Shared by the dry-run and the PLAN block so both state what the
 * writes will actually do, instead of answering from a path lookup the writes
 * no longer use.
 */
const resolvePlanLedgerMatches = async ({
    plan,
    sourceStories,
    copyMaps,
    targetSpace,
}: {
    plan: CopyPlanItem[];
    sourceStories: any[];
    copyMaps: CopyMaps;
    targetSpace: string;
}): Promise<Map<string, CopyLedgerMatch>> => {
    const sourceIdByFullSlug = new Map<string, number>(
        sourceStories
            .map((item: any) => item?.story)
            .filter(Boolean)
            .map(
                (story: any) =>
                    [String(story.full_slug ?? ""), Number(story.id)] as const,
            ),
    );
    const mapped = plan
        .map((item) => {
            const sourceId = sourceIdByFullSlug.get(item.sourceFullSlug);

            return {
                item,
                targetId:
                    sourceId === undefined
                        ? undefined
                        : copyMaps.storyIds.get(sourceId),
            };
        })
        .filter(
            (entry): entry is { item: CopyPlanItem; targetId: number } =>
                entry.targetId !== undefined,
        );

    if (mapped.length === 0) {
        return new Map();
    }

    const results = await mapWithConcurrency(
        mapped,
        TARGET_CONFLICT_CHECK_CONCURRENCY,
        async ({ item, targetId }) => {
            const targetStory = await managementApi.stories.getStoryById(
                String(targetId),
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );
            const found = targetStory?.story;
            const match: CopyLedgerMatch = !found?.id
                ? { match: "missing", targetId }
                : isTrashedStory(found)
                  ? {
                        match: "missing",
                        targetId,
                        deletedAt: String(found.deleted_at),
                    }
                  : {
                        match: isStoryAtPlannedPath(found, item.targetFullSlug)
                            ? "matched"
                            : "moved",
                        targetId,
                        currentFullSlug: found.full_slug,
                    };

            return [item.targetFullSlug, match] as const;
        },
    );

    return new Map(results);
};

const describeLedgerMatch = (ledger?: CopyLedgerMatch): string => {
    if (!ledger) {
        return "";
    }

    if (ledger.match === "matched") {
        return " (ledger: matched)";
    }

    if (ledger.match === "moved") {
        return ` (ledger: moved, now at ${ledger.currentFullSlug})`;
    }

    if (ledger.deletedAt) {
        return ` (ledger: points at a deleted story, trashed ${ledger.deletedAt}; will be created again)`;
    }

    return " (ledger: target missing, will be created again)";
};

interface ContentBlokVisit {
    path: string;
    uid?: string;
    component: string;
    field?: string;
    parentComponent?: string;
}

type DisallowedComponentMatch = ContentBlokVisit;

// Walk a story's content blok tree depth-first, invoking `visit` for every blok
// (object carrying a `component`) with its path, _uid, enclosing field and the
// component it is nested inside. Shared by the failure diagnostic and the
// dry-run compatibility check.
const walkContentBloks = (
    content: any,
    visit: (blok: ContentBlokVisit) => void,
) => {
    const walk = (
        value: any,
        path: string,
        field: string | undefined,
        parentComponent: string | undefined,
    ) => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                walk(item, `${path}[${index}]`, field, parentComponent);
            });
            return;
        }

        if (!value || typeof value !== "object") {
            return;
        }

        const component =
            typeof value.component === "string" ? value.component : undefined;

        if (component) {
            visit({
                path,
                uid: typeof value._uid === "string" ? value._uid : undefined,
                component,
                field,
                parentComponent,
            });
        }

        const nextParentComponent = component ?? parentComponent;

        for (const [key, child] of Object.entries(value)) {
            if (key === "component" || key === "_uid") {
                continue;
            }

            walk(
                child,
                path ? `${path}.${key}` : key,
                key,
                nextParentComponent,
            );
        }
    };

    walk(content, "content", undefined, undefined);
};

// Storyblok answers a schema violation with a 422 whose body reads like
// "The component(s) sb-content-group are not allowed in the field content".
// Parse out the offending component name(s) and the field they were rejected in.
const parseDisallowedComponentError = (
    responseText: unknown,
): { components: string[]; field?: string } | undefined => {
    if (typeof responseText !== "string") {
        return undefined;
    }

    const match = responseText.match(
        /component\(s\)\s+(.+?)\s+are not allowed in the field\s+([^\s.]+)/i,
    );

    if (!match || !match[1]) {
        return undefined;
    }

    const components = match[1]
        .split(",")
        .map((component) => component.trim())
        .filter(Boolean);

    if (components.length === 0) {
        return undefined;
    }

    return { components, field: match[2] };
};

// Record every place the given component(s) appear in a story's content, with
// the path, _uid and enclosing field so a failing copy can be traced back to
// the exact blok in the source story.
const collectComponentPaths = (
    content: any,
    targetComponents: Set<string>,
): DisallowedComponentMatch[] => {
    const matches: DisallowedComponentMatch[] = [];

    walkContentBloks(content, (blok) => {
        if (targetComponents.has(blok.component)) {
            matches.push(blok);
        }
    });

    return matches;
};

const describeDisallowedComponentMatches = (
    matches: DisallowedComponentMatch[],
): string =>
    matches
        .map((match) => {
            const uidLabel = match.uid ? ` (_uid ${match.uid})` : "";
            const fieldLabel = match.field ? ` in field '${match.field}'` : "";
            const parentLabel = match.parentComponent
                ? ` of component '${match.parentComponent}'`
                : "";

            return `  - '${match.component}' at ${match.path}${fieldLabel}${parentLabel}${uidLabel}`;
        })
        .join("\n");

const assertStoryUpdateSucceeded = ({
    result,
    sourceStory,
    targetStoryId,
    targetSpace,
    content,
}: {
    result: any;
    sourceStory: any;
    targetStoryId: number;
    targetSpace: string;
    content?: any;
}) => {
    if (result?.ok !== false) {
        return;
    }

    const statusLabel = result.status
        ? `status ${result.status}`
        : "unknown status";
    const responseLabel = result.response
        ? ` Response: ${result.response}`
        : "";

    let disallowedLabel = "";
    const disallowed = parseDisallowedComponentError(result.response);

    if (disallowed && content) {
        const matches = collectComponentPaths(
            content,
            new Set(disallowed.components),
        );
        const fieldLabel = disallowed.field
            ? ` in field '${disallowed.field}'`
            : "";

        if (matches.length > 0) {
            const details = describeDisallowedComponentMatches(matches);

            disallowedLabel = `\nDisallowed component(s) [${disallowed.components.join(", ")}]${fieldLabel} located in source story content at:\n${details}`;

            Logger.warning(
                `Story '${sourceStory.full_slug ?? sourceStory.slug}' (source id ${sourceStory.id}, target id ${targetStoryId}) rejected because component(s) [${disallowed.components.join(", ")}]${fieldLabel} are not allowed in the target space schema. Found at:\n${details}`,
            );
        } else {
            disallowedLabel = `\nComponent(s) [${disallowed.components.join(", ")}]${fieldLabel} are not allowed in the target space schema, but were not located in the rewritten content (they may live in a nested/published layer).`;
        }
    }

    throw new Error(
        `Failed to update copied story '${sourceStory.full_slug ?? sourceStory.slug}' in target space '${targetSpace}' (source id ${sourceStory.id}, target story id ${targetStoryId}, ${statusLabel}).${responseLabel}${disallowedLabel}`,
    );
};

const isStoryUpdateNotFound = (result: any): boolean =>
    result?.ok === false && Number(result.status) === 404;

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

type CopyTargetConflictCheck = {
    /** Planned paths that already hold a story or folder in the target. */
    conflicts: CopyPlanItem[];
    /** Id of the story occupying each of those paths, keyed by target path. */
    existingTargetStoryIdByFullSlug: Map<string, number>;
};

const findTargetConflicts = async (
    plan: CopyPlanItem[],
    targetSpace: string,
): Promise<CopyTargetConflictCheck> => {
    let checked = 0;

    if (plan.length === 0) {
        return { conflicts: [], existingTargetStoryIdByFullSlug: new Map() };
    }

    Logger.warning(
        `Checking ${plan.length} planned target path(s) for existing stories/folders.`,
    );

    const results = await mapWithConcurrency(
        plan,
        TARGET_CONFLICT_CHECK_CONCURRENCY,
        async (item) => {
            const existingStory = await managementApi.stories.getStoryBySlug(
                item.targetFullSlug,
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );

            checked += 1;
            if (
                checked === plan.length ||
                checked % 25 === 0 ||
                plan.length <= 25
            ) {
                Logger.success(
                    `Checked ${checked} of ${plan.length} target path(s) for conflicts.`,
                );
            }

            if (!existingStory) {
                return null;
            }

            const existingStoryId = existingStory?.story?.id;

            return {
                item,
                existingTargetStoryId:
                    existingStoryId === undefined
                        ? undefined
                        : Number(existingStoryId),
            };
        },
    );

    const found = results.filter(
        (
            result,
        ): result is {
            item: CopyPlanItem;
            existingTargetStoryId: number | undefined;
        } => result !== null,
    );
    const conflicts = found.map((result) => result.item);
    const existingTargetStoryIdByFullSlug = new Map<string, number>(
        found
            .filter((result) => result.existingTargetStoryId !== undefined)
            .map(
                (result) =>
                    [
                        result.item.targetFullSlug,
                        result.existingTargetStoryId as number,
                    ] as const,
            ),
    );

    Logger.success(
        `Target conflict check complete. Found ${conflicts.length} existing target path(s).`,
    );

    return { conflicts, existingTargetStoryIdByFullSlug };
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

const uniqueSorted = (values: string[]): string[] =>
    [...new Set(values)].filter(Boolean).sort();

const summarizeComponentCompatibility = (
    checked: boolean,
    findings: ComponentCompatibilityFinding[],
): CopyDryRunComponentCompatibility => ({
    checked,
    missingComponents: uniqueSorted(
        findings
            .filter((finding) => finding.reason === "missing_in_target")
            .map((finding) => finding.component),
    ),
    disallowedInFieldComponents: uniqueSorted(
        findings
            .filter((finding) => finding.reason === "not_allowed_in_field")
            .map((finding) => finding.component),
    ),
    findings,
});

const buildComponentCompatibilityWarnings = (
    componentCompatibility?: CopyDryRunComponentCompatibility,
): CopyPlanWarning[] => {
    if (
        !componentCompatibility ||
        componentCompatibility.findings.length === 0
    ) {
        return [];
    }

    const warnings: CopyPlanWarning[] = [];

    if (componentCompatibility.missingComponents.length > 0) {
        // Storyblok does not validate component names on save: a story using
        // a component the target lacks is written and published fine.
        warnings.push({
            code: "component_missing_in_target",
            message: `Component(s) missing from the target space schema: ${componentCompatibility.missingComponents.join(", ")}. Stories using them will render as unknown components in the editor; the write succeeds. Sync the components to edit those bloks in the target.`,
        });
    }

    if (componentCompatibility.disallowedInFieldComponents.length > 0) {
        warnings.push({
            code: "component_not_allowed_in_field",
            message: `Component(s) used in a field whose whitelist does not allow them: ${componentCompatibility.disallowedInFieldComponents.join(", ")}. Stories using them are saved as they are; the write succeeds and the editor flags them as out of schema.`,
        });
    }

    return warnings;
};

const buildSchemaDriftWarnings = (
    schemaDrift?: ReturnType<typeof findSchemaDrift>,
): CopyPlanWarning[] =>
    schemaDrift && schemaDrift.occurrences > 0
        ? [
              {
                  code: "schema_drift",
                  message: `Schema drift: ${schemaDrift.occurrences} field value(s) in ${schemaDrift.stories} story/stories do not have the shape their field type requires (see schemaDrift). Those story updates will fail until the content matches the target schema.`,
              },
          ]
        : [];

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
    exclude,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    withAssets?: boolean;
    dryRun: boolean;
    outputPath?: string;
    /** Root full_slugs the run excluded; they change what is selected. */
    exclude?: string[];
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

    // Without these the pasted command copies the roots the run left out.
    for (const value of exclude ?? []) {
        args.push("--exclude", value);
    }

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
    selection,
    dryRun,
    outputPath,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopyAssetsSelection;
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
    ];

    if (selection.type === "all") {
        args.push("--all");
    } else if (selection.type === "asset") {
        for (const value of selection.values) {
            args.push("--asset", value);
        }
    } else if (selection.type === "asset_folder") {
        for (const value of selection.values) {
            args.push("--assetFolder", value);
        }
    } else {
        args.push(
            "--referenced-by-stories",
            "--source",
            selection.storySelection.source,
            "--mode",
            selection.storySelection.mode,
        );
    }

    if (dryRun) {
        args.push("--dry-run");
    }

    if (outputPath) {
        args.push("--outputPath", outputPath);
    }

    return args.map(quoteCommandArg).join(" ");
};

/**
 * One asset, however it is written. Reading the URL is `assetKeyOf`'s job and
 * nobody else's: the same file appears under several hosts and with several
 * image-service tails, and counting those as different assets was exactly the
 * bug this command had.
 */
const parseStoryblokAssetUrl = (
    filename: string | undefined,
): { spaceId?: string; uniqueKey?: string } => {
    if (!filename) {
        return {};
    }

    const parts = assetKeyOf(filename);

    if (!parts) {
        return {
            uniqueKey: filename,
        };
    }

    return {
        spaceId: parts.spaceId,
        uniqueKey: `storyblok:${parts.spaceId}:${parts.hash}:${parts.name}`,
    };
};

const getAssetReferenceUniqueKey = (
    reference: CopyGraph["assetReferences"][number],
): string => {
    const parsed = parseStoryblokAssetUrl(reference.filename);

    return (
        parsed.uniqueKey ??
        (reference.assetId === undefined
            ? `unknown:${reference.path}`
            : `asset-id:${reference.assetId}`)
    );
};

const buildAssetReferenceSummary = ({
    graph,
    sourceSpace,
}: {
    graph?: CopyGraph;
    sourceSpace: string;
}): CopyDryRunAssetReferenceSummary | undefined => {
    if (!graph) {
        return undefined;
    }

    const statuses = [
        "mapped",
        "planned",
        "unresolved",
        "unsupported",
    ] as const;
    const uniqueByStatus = new Map<(typeof statuses)[number], Set<string>>(
        statuses.map((status) => [status, new Set<string>()]),
    );
    const occurrencesByStatus = new Map<(typeof statuses)[number], number>(
        statuses.map((status) => [status, 0]),
    );
    const foreignSpaces = new Map<
        string,
        { occurrences: number; uniqueAssets: Set<string> }
    >();
    const shapes = ["object", "string"] as const;
    const uniqueByShape = new Map<(typeof shapes)[number], Set<string>>(
        shapes.map((shape) => [shape, new Set<string>()]),
    );
    const occurrencesByShape = new Map<(typeof shapes)[number], number>(
        shapes.map((shape) => [shape, 0]),
    );

    for (const reference of graph.assetReferences) {
        const status = reference.status;
        const uniqueKey = getAssetReferenceUniqueKey(reference);

        occurrencesByStatus.set(
            status,
            (occurrencesByStatus.get(status) ?? 0) + 1,
        );
        uniqueByStatus.get(status)?.add(uniqueKey);

        // A reference the scanner did not label is an asset object: that is
        // the only shape that existed before string URLs were scanned.
        const shape = reference.shape ?? "object";

        occurrencesByShape.set(shape, (occurrencesByShape.get(shape) ?? 0) + 1);
        uniqueByShape.get(shape)?.add(uniqueKey);

        const parsed = parseStoryblokAssetUrl(reference.filename);
        if (parsed.spaceId && parsed.spaceId !== sourceSpace) {
            const existing = foreignSpaces.get(parsed.spaceId) ?? {
                occurrences: 0,
                uniqueAssets: new Set<string>(),
            };

            existing.occurrences += 1;
            existing.uniqueAssets.add(uniqueKey);
            foreignSpaces.set(parsed.spaceId, existing);
        }
    }

    const bucket = (
        status: (typeof statuses)[number],
    ): CopyDryRunAssetReferenceBucket => ({
        occurrences: occurrencesByStatus.get(status) ?? 0,
        uniqueAssets: uniqueByStatus.get(status)?.size ?? 0,
    });

    const shapeBucket = (
        shape: (typeof shapes)[number],
    ): CopyDryRunAssetReferenceBucket => ({
        occurrences: occurrencesByShape.get(shape) ?? 0,
        uniqueAssets: uniqueByShape.get(shape)?.size ?? 0,
    });

    return {
        mapped: bucket("mapped"),
        planned: bucket("planned"),
        unresolved: bucket("unresolved"),
        unsupported: bucket("unsupported"),
        byShape: {
            object: shapeBucket("object"),
            string: shapeBucket("string"),
        },
        foreignAssetSpaces: Array.from(foreignSpaces.entries())
            .map(([spaceId, summary]) => ({
                spaceId,
                occurrences: summary.occurrences,
                uniqueAssets: summary.uniqueAssets.size,
            }))
            .sort((left, right) => left.spaceId.localeCompare(right.spaceId)),
    };
};

const buildCopyDryRunReport = ({
    sourceSpace,
    targetSpace,
    selection,
    selections,
    destination,
    withAssets,
    input,
    plan,
    conflicts,
    graph,
    componentCompatibility,
    schemaDrift,
    willFail,
    translatedSlugs,
    outputPath,
    rootExpansion,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    /** Every selection, when the run was given more than one. */
    selections?: CopySelection[];
    /** What `--source /` expanded to, when it was given. */
    rootExpansion?: WholeSpaceExpansion;
    destination: string | undefined;
    withAssets: boolean;
    input: Record<string, any>;
    plan: CopyPlanItem[];
    conflicts: CopyPlanItem[];
    graph?: CopyGraph;
    componentCompatibility?: CopyDryRunComponentCompatibility;
    schemaDrift?: ReturnType<typeof findSchemaDrift>;
    willFail?: ReturnType<typeof summarizeStoriesWillFail>;
    translatedSlugs: CopyTranslatedSlugSummary;
    outputPath?: string;
}): CopyDryRunReport => {
    const items = withConflictFlags(plan, conflicts);
    // The artifact carries the same translated-slug account the console gives,
    // so a run read back from its JSON is not missing what the terminal said.
    const translatedSlugsWarning = buildCopyTranslatedSlugsWarning({
        summary: translatedSlugs,
        targetSpaceId: targetSpace,
    });
    const warnings = [
        ...buildDryRunWarnings({ conflicts, withAssets }),
        ...buildComponentCompatibilityWarnings(componentCompatibility),
        ...buildSchemaDriftWarnings(schemaDrift),
        ...(translatedSlugsWarning ? [translatedSlugsWarning] : []),
    ];
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
    const storyReferenceCounts = countStoryReferenceStatuses(
        graph?.storyReferences ?? [],
    );
    const assetsMapped =
        graph?.assets.filter((asset) => asset.action === "match").length ?? 0;
    const assetsToCopy =
        graph?.assets.filter((asset) => asset.action === "create").length ?? 0;
    const assetReferenceSummary = buildAssetReferenceSummary({
        graph,
        sourceSpace,
    });
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
            ...(selections && selections.length > 1 ? { selections } : {}),
            ...buildRootExpansionReport(rootExpansion),
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
            storyReferencesWillRelink: storyReferenceCounts.willRelink,
            storyReferencesWillBreak: storyReferenceCounts.willBreak,
            storyReferencesExternalKept: storyReferenceCounts.externalKept,
            storyReferencesUnresolved: storyReferenceCounts.unresolved,
            conflicts: conflicts.length,
            warnings: warnings.length + (graphSummary?.warnings ?? 0),
            errors: graphSummary?.errors ?? 0,
            componentIssues: componentCompatibility?.findings.length ?? 0,
            schemaDriftOccurrences: schemaDrift?.occurrences ?? 0,
            storiesWillFail: willFail?.stories ?? 0,
        },
        translatedSlugs,
        items,
        ...(graph ? { graph } : {}),
        ...(assetReferenceSummary ? { assetReferenceSummary } : {}),
        ...(componentCompatibility ? { componentCompatibility } : {}),
        ...(schemaDrift ? { schemaDrift } : {}),
        ...(willFail ? { willFail } : {}),
        warnings,
        errors: graph?.errors ?? [],
        failures: [],
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
                exclude: rootExpansion?.excluded.map((root) => root.full_slug),
            }),
            apply: buildCopyCommand({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                withAssets,
                dryRun: false,
                exclude: rootExpansion?.excluded.map((root) => root.full_slug),
            }),
        },
    };
};

const buildCopyAssetsDryRunReport = ({
    sourceSpace,
    targetSpace,
    selection,
    input,
    outputPath,
    graph,
    internalTags,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopyAssetsSelection;
    input: Record<string, any>;
    outputPath?: string;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    internalTags: CopyInternalTagPlan;
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
            selection: toSelectionReport(selection),
        },
        summary: {
            plannedCreates: graphSummary.assetFolders + graphSummary.assets,
            assetFolders: graphSummary.assetFolders,
            assets: graphSummary.assets,
            warnings: graphSummary.warnings,
            errors: graphSummary.errors,
        },
        internalTags: toInternalTagsReport(internalTags),
        graph,
        limitations: graph.limitations,
        commands: {
            dryRun: buildCopyAssetsCommand({
                sourceSpace,
                targetSpace,
                selection,
                dryRun: true,
                outputPath,
            }),
            apply: buildCopyAssetsCommand({
                sourceSpace,
                targetSpace,
                selection,
                dryRun: false,
            }),
        },
    };
};

const COPY_ITEM_OUTCOMES: CopyItemOutcome[] = [
    "created",
    "matched",
    "updated",
    "published",
    "publish_skipped",
    "update_failed",
    "create_failed",
    "skipped_parent_failed",
];

const countCopyOutcomes = (
    outcomes: Iterable<CopyItemOutcome | undefined>,
): Record<CopyItemOutcome, number> => {
    const counts = Object.fromEntries(
        COPY_ITEM_OUTCOMES.map((outcome) => [outcome, 0]),
    ) as Record<CopyItemOutcome, number>;

    for (const outcome of outcomes) {
        if (outcome) {
            counts[outcome] += 1;
        }
    }

    return counts;
};

/** `updated 1, update_failed 1` — only the outcomes that happened. */
const formatCopyOutcomeCounts = (
    counts: Record<CopyItemOutcome, number>,
): string => {
    const parts = COPY_ITEM_OUTCOMES.filter(
        (outcome) => counts[outcome] > 0,
    ).map((outcome) => `${outcome} ${counts[outcome]}`);

    return parts.length > 0 ? parts.join(", ") : "nothing written";
};

const resolveThrownStatus = (error: any): number | undefined => {
    const status = Number(
        error?.status ?? error?.response?.status ?? error?.message?.status,
    );

    return Number.isFinite(status) && status > 0 ? status : undefined;
};

const describeThrown = (error: any): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error?.message === "string") {
        return error.message;
    }

    return typeof error === "string" ? error : JSON.stringify(error);
};

const buildCopyStoriesApplyReport = ({
    sourceSpace,
    targetSpace,
    selection,
    selections,
    destination,
    withAssets,
    input,
    plan,
    storySummary,
    graph,
    assetCopyReport,
    translatedSlugs,
    manifestRoot,
    failures,
    outcomes,
    rootExpansion,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    /** Every selection, when the run was given more than one. */
    selections?: CopySelection[];
    /** What `--source /` expanded to, when it was given. */
    rootExpansion?: WholeSpaceExpansion;
    destination: string | undefined;
    withAssets: boolean;
    input: Record<string, any>;
    plan: CopyPlanItem[];
    storySummary: CopyStoriesApplySummary;
    graph?: CopyGraph;
    assetCopyReport?: CopyAssetsApplyReport;
    translatedSlugs: CopyTranslatedSlugSummary;
    manifestRoot?: string;
    failures: CopyRunFailure[];
    /** Keyed by source full_slug, the key every plan item carries. */
    outcomes: Map<string, CopyOutcomeRecord>;
}): CopyStoriesApplyReport => {
    const items = plan.map((item) => {
        const record = outcomes.get(item.sourceFullSlug);

        return record
            ? {
                  ...item,
                  outcome: record.outcome,
                  ...(record.targetId !== undefined
                      ? { targetId: record.targetId }
                      : {}),
              }
            : item;
    });
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        rootDir: manifestRoot,
    });
    const graphSummary = graph ? summarizeCopyGraph(graph) : undefined;
    // What the run left behind survives in the artifact too: an apply report
    // read a week later is the only record that the slugs were dropped.
    const translatedSlugsWarning = buildCopyTranslatedSlugsWarning({
        summary: translatedSlugs,
        targetSpaceId: targetSpace,
    });

    return {
        schemaVersion: 1,
        command: "copy stories",
        dryRun: false,
        generatedAt: new Date().toISOString(),
        input,
        normalized: {
            sourceSpaceId: sourceSpace,
            targetSpaceId: targetSpace,
            source: selection.source,
            destination: normalizeDestination(destination) || "root",
            mode: selection.mode,
            withAssets,
            ...(selections && selections.length > 1 ? { selections } : {}),
            ...buildRootExpansionReport(rootExpansion),
        },
        summary: {
            ...storySummary,
            ...(assetCopyReport
                ? {
                      assetFoldersCreated:
                          assetCopyReport.summary.assetFoldersCreated,
                      assetFoldersMatched:
                          assetCopyReport.summary.assetFoldersMatched,
                      assetsCreated: assetCopyReport.summary.assetsCreated,
                      assetsMatched: assetCopyReport.summary.assetsMatched,
                  }
                : {}),
            warnings:
                (graphSummary?.warnings ?? 0) +
                (assetCopyReport?.summary.warnings ?? 0) +
                (translatedSlugsWarning ? 1 : 0),
            errors:
                (graphSummary?.errors ?? 0) +
                (assetCopyReport?.summary.errors ?? 0),
            outcomes: countCopyOutcomes(items.map((item) => item.outcome)),
            failed: failures.length,
        },
        translatedSlugs,
        items,
        failures,
        ...(graph ? { graph } : {}),
        ...(assetCopyReport ? { assetCopy: assetCopyReport } : {}),
        manifestPaths: {
            stories: manifestPaths.stories,
            assets: manifestPaths.assets,
            assetFolders: manifestPaths.assetFolders,
            combined: manifestPaths.combined,
        },
        warnings: [
            ...(graph?.warnings ?? []),
            ...(assetCopyReport?.warnings ?? []),
            ...(translatedSlugsWarning ? [translatedSlugsWarning] : []),
        ],
        errors: [...(graph?.errors ?? []), ...(assetCopyReport?.errors ?? [])],
    };
};

const writeDryRunReport = async (outputPath: string, report: unknown) => {
    const outputDirectory = path.dirname(outputPath);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    Logger.success(`[dry-run] Copy plan written to ${outputPath}`);
};

/**
 * One ledger file as the inspector needs to see it. `loadManifest` answers a
 * missing file with an empty list, which is the right answer for a run and the
 * wrong one for an inspector: "never written" and "written empty" are
 * different states, and a file that will not parse is a third.
 */
const readCopyManifestFile = async (
    kind: CopyManifestFileKind,
    filePath: string,
): Promise<CopyManifestFileInput> => {
    let content: string;

    try {
        content = await fs.readFile(filePath, "utf8");
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return { kind, path: filePath, exists: false };
        }

        return {
            kind,
            path: filePath,
            exists: true,
            error: String(error?.message ?? error),
        };
    }

    try {
        return {
            kind,
            path: filePath,
            exists: true,
            entries: parseManifestJsonl(content, filePath),
        };
    } catch (error: any) {
        return {
            kind,
            path: filePath,
            exists: true,
            error: String(error?.message ?? error),
        };
    }
};

const COPY_MANIFEST_FILE_KINDS: [
    CopyManifestFileKind,
    keyof CopyManifestPaths,
][] = [
    ["combined", "combined"],
    ["stories", "stories"],
    ["assets", "assets"],
    ["assetFolders", "assetFolders"],
];

const readCopyManifestFiles = async (
    paths: CopyManifestPaths,
): Promise<CopyManifestFileInput[]> =>
    Promise.all(
        COPY_MANIFEST_FILE_KINDS.map(([kind, key]) =>
            readCopyManifestFile(kind, paths[key] as string),
        ),
    );

/**
 * Every space pair with a ledger directory on disk. Discovery is the whole
 * point of the no-argument listing: the answer must come from what was actually
 * copied, never from the configured space, which is a guess that reads a
 * different pair's ledger — or an empty one — and calls it healthy.
 */
const discoverCopyManifestPairs = async (
    manifestRoot: string | undefined,
): Promise<{ sourceSpaceId: string; targetSpaceId: string }[]> => {
    const root = getCopyManifestRoot(manifestRoot);
    const pairs: { sourceSpaceId: string; targetSpaceId: string }[] = [];

    let sources: string[];

    try {
        sources = (await fs.readdir(root, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    for (const sourceSpaceId of sources) {
        const targets = (
            await fs.readdir(path.join(root, sourceSpaceId), {
                withFileTypes: true,
            })
        )
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

        for (const targetSpaceId of targets) {
            pairs.push({ sourceSpaceId, targetSpaceId });
        }
    }

    return pairs;
};

type CopyManifestPairSelection = {
    sourceSpaceId: string;
    targetSpaceId: string;
};

/**
 * The pair to inspect, named explicitly or not at all.
 *
 * `copy manifests` never falls back to the configured space: a ledger belongs
 * to a pair, and defaulting either side reads the wrong file and reports it as
 * the answer. Half a pair is an error for the same reason.
 */
const describeUnsafeCopySpaceSegment = (
    label: string,
    value: string,
    flagName: string,
): string =>
    `${flagName} ${label} space id must be a plain number, not '${value}'. A space id becomes a directory name in the copy ledger, so anything else can point outside it.`;

/**
 * One `<sourceSpaceId>:<targetSpaceId>` value, checked as two path segments
 * before it is ever joined into a path.
 */
const parseCopyManifestPairValue = (
    raw: string,
    flagName: string,
): { pair?: CopyManifestPairSelection; error?: string } => {
    const [sourceSpaceId, targetSpaceId, ...rest] = raw.split(":");

    if (!sourceSpaceId || !targetSpaceId || rest.length > 0) {
        return {
            error: `${flagName} must be written as <sourceSpaceId>:<targetSpaceId>, not '${raw}'.`,
        };
    }

    for (const [label, value] of [
        ["source", sourceSpaceId],
        ["target", targetSpaceId],
    ] as const) {
        if (!isSafeCopySpaceSegment(value)) {
            return {
                error: describeUnsafeCopySpaceSegment(label, value, flagName),
            };
        }
    }

    return { pair: { sourceSpaceId, targetSpaceId } };
};

const resolveCopyManifestPair = (
    flags: Record<string, any>,
): { pair?: CopyManifestPairSelection; error?: string } => {
    const rawPair = readStringFlag(flags, ["pair"]);
    const from = readStringFlag(flags, ["from", "sourceSpace"]);
    const to = readStringFlag(flags, ["to", "targetSpace"]);

    if (rawPair) {
        return parseCopyManifestPairValue(rawPair, "--pair");
    }

    if (from && to) {
        for (const [label, value, flagName] of [
            ["source", from, "--from"],
            ["target", to, "--to"],
        ] as const) {
            if (!isSafeCopySpaceSegment(value)) {
                return {
                    error: describeUnsafeCopySpaceSegment(
                        label,
                        value,
                        flagName,
                    ),
                };
            }
        }

        return { pair: { sourceSpaceId: from, targetSpaceId: to } };
    }

    if (from || to) {
        return {
            error: "Name the whole pair: --pair <sourceSpaceId>:<targetSpaceId>, or both --from and --to. copy manifests never falls back to the configured space.",
        };
    }

    return {};
};

/**
 * Everything inside the pair directory, walked with `lstat` so a symlink is
 * recorded as a symlink rather than followed into whatever it points at. The
 * gate has to be able to name every entry a recursive delete would take.
 */
const readCopyManifestRemovalEntries = async (
    dir: string,
): Promise<{ exists: boolean; entries: CopyManifestRemovalEntry[] }> => {
    const entries: CopyManifestRemovalEntry[] = [];

    const walk = async (current: string, prefix: string): Promise<void> => {
        const names = (await fs.readdir(current)).sort();

        for (const name of names) {
            const absolute = path.join(current, name);
            const relative = prefix ? `${prefix}/${name}` : name;
            const stats = await fs.lstat(absolute);

            if (stats.isSymbolicLink()) {
                entries.push({
                    path: relative,
                    kind: "symlink",
                    bytes: stats.size,
                    target: await fs.readlink(absolute),
                    unexpected: true,
                });
                continue;
            }

            if (stats.isDirectory()) {
                entries.push({
                    path: relative,
                    kind: "directory",
                    bytes: 0,
                    unexpected: true,
                });
                await walk(absolute, relative);
                continue;
            }

            entries.push({
                path: relative,
                kind: stats.isFile() ? "file" : "other",
                bytes: stats.size,
                unexpected: !isKnownCopyLedgerFile(relative),
            });
        }
    };

    try {
        await walk(dir, "");
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return { exists: false, entries: [] };
        }

        throw error;
    }

    return { exists: true, entries };
};

/**
 * Whether a path lands inside a directory, compared after resolving both. Used
 * to keep a report out of the directory the same command is about to delete.
 */
/**
 * The real location a path names, for a path that need not exist yet.
 *
 * `fs.realpath` fails outright on a missing file, and an output path usually is
 * missing — it is about to be written. So the deepest ancestor that does exist
 * is resolved, and the not-yet-existing tail is re-attached to it. That is what
 * makes a symlinked parent visible: `<tmp>/report-link/report.json` has no
 * `report.json` to resolve, but `report-link` resolves to whatever it points at.
 *
 * When the path itself exists and is a symlink, `realpath` follows it, which is
 * the other half of the same question.
 */
const resolveRealPathOfDeepestExisting = async (
    target: string,
): Promise<string> => {
    const resolved = path.resolve(target);
    const trailing: string[] = [];
    let current = resolved;

    for (;;) {
        try {
            const real = await fs.realpath(current);

            return trailing.length === 0
                ? real
                : path.join(real, ...[...trailing].reverse());
        } catch (error: any) {
            if (error?.code !== "ENOENT") {
                throw error;
            }

            const parent = path.dirname(current);

            if (parent === current) {
                // Nothing on this path exists at all; the lexical answer is the
                // only one there is, and it cannot be hiding a link.
                return resolved;
            }

            trailing.push(path.basename(current));
            current = parent;
        }
    }
};

/**
 * Whether a path is itself a symbolic link, dangling or not. `lstat` is the
 * whole point: it reports on the link, where `stat` and `realpath` report on
 * whatever it points at — and on a dangling link they report nothing at all.
 */
const isSymbolicLinkPath = async (target: string): Promise<boolean> => {
    try {
        return (await fs.lstat(path.resolve(target))).isSymbolicLink();
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return false;
        }

        throw error;
    }
};

/**
 * Whether a path really lands inside a directory, compared after both have been
 * resolved against the filesystem. Comparing the strings alone is not enough:
 * a parent component of the output path can be a symlink into the directory
 * about to be deleted, and the lexical forms will not look alike at all.
 */
const isReallyInsideDirectory = async (
    candidate: string,
    directory: string,
): Promise<boolean> => {
    const [resolved, resolvedDirectory] = await Promise.all([
        resolveRealPathOfDeepestExisting(candidate),
        resolveRealPathOfDeepestExisting(directory),
    ]);

    return (
        resolved === resolvedDirectory ||
        resolved.startsWith(resolvedDirectory + path.sep)
    );
};

/**
 * When the ledger file was really last touched. Read from the filesystem rather
 * than from a `created_at` inside it, which records what a run believed it did.
 */
const readCopyManifestMtime = async (
    filePath: string,
): Promise<{ lastWrittenAt?: string }> => {
    try {
        const stats = await fs.stat(filePath);

        return { lastWrittenAt: stats.mtime.toISOString() };
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return {};
        }

        throw error;
    }
};

const parseCopyManifestTypes = (
    flags: Record<string, any>,
): { types?: CopyResourceType[]; error?: string } => {
    const raw = readStringListFlag(flags, ["type"]);

    if (raw.length === 0) {
        return {};
    }

    const types: CopyResourceType[] = [];

    for (const value of raw) {
        const normalized = value.trim().toLowerCase().replace(/-/g, "_");

        if (!isCopyResourceType(normalized)) {
            return {
                error: `--type must be one of: story, asset, asset_folder. Received '${value}'.`,
            };
        }

        if (!types.includes(normalized)) {
            types.push(normalized);
        }
    }

    return { types };
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

const isNumericSelector = (value: string): boolean => /^\d+$/.test(value);

const findSourceAssetBySelector = (assets: any[], selector: string): any => {
    if (isNumericSelector(selector)) {
        const byId = assets.find(
            (asset) => Number(asset.id) === Number(selector),
        );

        if (byId) {
            return byId;
        }
    }

    const exactFilenameMatches = assets.filter(
        (asset) => asset.filename === selector,
    );

    if (exactFilenameMatches.length === 1) {
        return exactFilenameMatches[0];
    }

    if (exactFilenameMatches.length > 1) {
        throw new Error(
            `Asset selector '${selector}' matched multiple source assets by filename. Use --asset <asset-id>.`,
        );
    }

    const fileNameMatches = assets.filter(
        (asset) => getFileName(asset.filename) === selector,
    );

    if (fileNameMatches.length === 1) {
        return fileNameMatches[0];
    }

    if (fileNameMatches.length > 1) {
        throw new Error(
            `Asset selector '${selector}' matched multiple source assets by file name. Use --asset <asset-id>.`,
        );
    }

    throw new Error(
        `Asset selector '${selector}' did not match a source asset by id, filename, or unique file name.`,
    );
};

const findSourceAssetFolderBySelector = (
    folderById: Map<number, any>,
    folderByPath: Map<string, any>,
    selector: string,
): any => {
    if (isNumericSelector(selector)) {
        const byId = folderById.get(Number(selector));

        if (byId) {
            return byId;
        }
    }

    const normalizedPath = normalizeAssetFolderPath(selector);
    const byPath = folderByPath.get(normalizedPath);

    if (byPath) {
        return byPath;
    }

    throw new Error(
        `Asset folder selector '${selector}' did not match a source asset folder by id or path.`,
    );
};

const addAssetFolderAncestors = ({
    folderId,
    folderById,
    selectedFolderIds,
}: {
    folderId: number | null | undefined;
    folderById: Map<number, any>;
    selectedFolderIds: Set<number>;
}) => {
    const visited = new Set<number>();
    let currentFolderId = folderId;

    while (currentFolderId !== null && currentFolderId !== undefined) {
        const currentFolder = folderById.get(Number(currentFolderId));

        if (!currentFolder || visited.has(Number(currentFolder.id))) {
            break;
        }

        selectedFolderIds.add(Number(currentFolder.id));
        visited.add(Number(currentFolder.id));
        currentFolderId = currentFolder.parent_id;
    }
};

const collectAssetFolderSubtreeIds = (
    rootFolderId: number,
    folders: any[],
): Set<number> => {
    const selected = new Set<number>([rootFolderId]);
    let changed = true;

    while (changed) {
        changed = false;

        for (const folder of folders) {
            const folderId = Number(folder.id);
            const parentId = folder.parent_id;

            if (
                parentId !== null &&
                parentId !== undefined &&
                selected.has(Number(parentId)) &&
                !selected.has(folderId)
            ) {
                selected.add(folderId);
                changed = true;
            }
        }
    }

    return selected;
};

const selectSourceAssetsForCopy = ({
    selection,
    sourceAssets,
    sourceAssetFolders,
}: {
    selection: CopyAssetsSelection;
    sourceAssets: any[];
    sourceAssetFolders: any[];
}): { assets: any[]; assetFolders: any[] } => {
    if (selection.type === "all") {
        return {
            assets: sourceAssets,
            assetFolders: sourceAssetFolders,
        };
    }

    const folderById = new Map(
        sourceAssetFolders.map(
            (folder) => [Number(folder.id), folder] as const,
        ),
    );
    const folderByPath = buildAssetFolderPathMap(sourceAssetFolders);
    const selectedAssetIds = new Set<number>();
    const selectedFolderIds = new Set<number>();

    if (selection.type === "asset") {
        for (const selector of selection.values) {
            const asset = findSourceAssetBySelector(sourceAssets, selector);

            selectedAssetIds.add(Number(asset.id));
            addAssetFolderAncestors({
                folderId: asset.asset_folder_id,
                folderById,
                selectedFolderIds,
            });
        }
    }

    if (selection.type === "asset_folder") {
        for (const selector of selection.values) {
            const folder = findSourceAssetFolderBySelector(
                folderById,
                folderByPath,
                selector,
            );
            const subtreeFolderIds = collectAssetFolderSubtreeIds(
                Number(folder.id),
                sourceAssetFolders,
            );

            for (const folderId of subtreeFolderIds) {
                selectedFolderIds.add(folderId);
            }

            addAssetFolderAncestors({
                folderId: folder.parent_id,
                folderById,
                selectedFolderIds,
            });
        }

        for (const asset of sourceAssets) {
            if (
                asset.asset_folder_id !== null &&
                asset.asset_folder_id !== undefined &&
                selectedFolderIds.has(Number(asset.asset_folder_id))
            ) {
                selectedAssetIds.add(Number(asset.id));
            }
        }
    }

    return {
        assets: sourceAssets.filter((asset) =>
            selectedAssetIds.has(Number(asset.id)),
        ),
        assetFolders: sourceAssetFolders.filter((folder) =>
            selectedFolderIds.has(Number(folder.id)),
        ),
    };
};

const selectSourceAssetsFromGraph = ({
    graph,
    sourceAssets,
    sourceAssetFolders,
}: {
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    sourceAssets: any[];
    sourceAssetFolders: any[];
}): { assets: any[]; assetFolders: any[] } => {
    const graphAssetIds = new Set(
        graph.assets.map((asset) => Number(asset.sourceId)),
    );
    const graphAssetFolderIds = new Set(
        graph.assetFolders.map((folder) => Number(folder.sourceId)),
    );

    return {
        assets: sourceAssets.filter((asset) =>
            graphAssetIds.has(Number(asset.id)),
        ),
        assetFolders: sourceAssetFolders.filter((folder) =>
            graphAssetFolderIds.has(Number(folder.id)),
        ),
    };
};

/**
 * What a run can do about the internal tags of the assets it is copying.
 *
 * A personal access token cannot create an internal tag — `POST internal_tags`
 * answers 403 "This endpoint does not support this token type" — so a tag the
 * target lacks is not created, it is NAMED, and a person makes it in Storyblok
 * and reruns. Matching is by trimmed name, the ledger's own mappings first, so
 * a tag renamed in the target keeps the mapping this pair already agreed on.
 */
type CopyInternalTagPlan = {
    /** Source tag id -> target tag id, for tags the target really has. */
    mapping: Map<number, number>;
    matched: { sourceId: number; targetId: number; name: string }[];
    /** Names of tags a selected asset uses and the target does not have. */
    missing: string[];
    /** Selected assets carrying at least one tag. */
    assetsWithTags: number;
    /** Selected assets that will lose at least one tag until it is created. */
    assetsWithMissingTags: number;
};

const EMPTY_INTERNAL_TAG_PLAN: CopyInternalTagPlan = {
    mapping: new Map(),
    matched: [],
    missing: [],
    assetsWithTags: 0,
    assetsWithMissingTags: 0,
};

const assetInternalTagIds = (asset: any): number[] =>
    Array.isArray(asset?.internal_tag_ids)
        ? asset.internal_tag_ids
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id))
        : [];

const buildCopyInternalTagPlan = ({
    sourceTags,
    targetTags,
    assets,
    ledgerTagIds,
}: {
    sourceTags: { id: number; name: string }[];
    targetTags: { id: number; name: string }[];
    assets: any[];
    ledgerTagIds?: Map<number, number>;
}): CopyInternalTagPlan => {
    const sourceTagById = new Map(
        sourceTags.map((tag) => [Number(tag.id), tag] as const),
    );
    const targetTagByName = new Map(
        targetTags.map(
            (tag) => [String(tag.name ?? "").trim(), Number(tag.id)] as const,
        ),
    );
    const targetTagIds = new Set(targetTags.map((tag) => Number(tag.id)));
    const usedTagIds = new Set<number>();

    for (const asset of assets) {
        for (const id of assetInternalTagIds(asset)) {
            usedTagIds.add(id);
        }
    }

    const mapping = new Map<number, number>();
    const matched: CopyInternalTagPlan["matched"] = [];
    const missing = new Set<string>();

    for (const sourceId of [...usedTagIds].sort((a, b) => a - b)) {
        const tag = sourceTagById.get(sourceId);
        // A tag id an asset carries but the tag list does not hold: nothing to
        // match on, and nothing to name but the id itself.
        const name = String(tag?.name ?? "").trim();
        const fromLedger = ledgerTagIds?.get(sourceId);
        const targetId =
            fromLedger !== undefined && targetTagIds.has(fromLedger)
                ? fromLedger
                : name.length > 0
                  ? targetTagByName.get(name)
                  : undefined;

        if (targetId === undefined) {
            missing.add(name.length > 0 ? name : `#${sourceId}`);
            continue;
        }

        mapping.set(sourceId, targetId);
        matched.push({ sourceId, targetId, name });
    }

    let assetsWithTags = 0;
    let assetsWithMissingTags = 0;

    for (const asset of assets) {
        const ids = assetInternalTagIds(asset);

        if (ids.length === 0) {
            continue;
        }

        assetsWithTags += 1;

        if (ids.some((id) => !mapping.has(id))) {
            assetsWithMissingTags += 1;
        }
    }

    return {
        mapping,
        matched,
        missing: [...missing].sort((left, right) =>
            left.localeCompare(right, "en"),
        ),
        assetsWithTags,
        assetsWithMissingTags,
    };
};

/**
 * The metadata PUT of one asset, for a freshly created and for an already
 * matched target alike. The body carries only tag ids the target really has;
 * an asset whose tags are all missing is still written, without the key, so
 * alt, title and copyright land either way.
 */
/**
 * How one run talks while it works: a live line, heartbeat lines, or nothing
 * but the start and the end — and whether the API layer may print its own
 * per-item detail.
 *
 * Decided once, from the flags and the world, and handed to every phase. With
 * `--verbose` the progress steps aside (start and finish only) and today's
 * per-item lines come back, so the two never fight over the same row.
 */
type CopyOutput = {
    mode: ProgressMode;
    verbose: boolean;
    /** `quiet` for the API layer: the opposite of `--verbose`. */
    quiet: boolean;
    phase: (label: string, total: number) => Progress;
};

const resolveCopyOutput = (flags: Record<string, any>): CopyOutput => {
    const verbose = Boolean(flags["verbose"]);
    const preference = (readStringFlag(flags, ["progress"]) ??
        "auto") as ProgressModePreference;
    const resolved = resolveProgressMode({
        preference,
        isTTY: process.stdout.isTTY,
        ci: process.env["CI"],
    });
    // Detail and a live line cannot share one terminal row.
    const mode: ProgressMode = verbose ? "off" : resolved;

    return {
        mode,
        verbose,
        quiet: !verbose,
        phase: (label, total) =>
            createProgress({
                label,
                total,
                mode,
                stream: process.stdout,
            }),
    };
};

/** What a copied item's outcome means to a counter on the progress line. */
const toProgressOutcome = (outcome: CopyItemOutcome): ProgressOutcome => {
    if (outcome === "update_failed") {
        return "metadata_failed";
    }

    if (outcome === "create_failed") {
        return "failed";
    }

    if (outcome === "skipped_parent_failed" || outcome === "publish_skipped") {
        return "skipped";
    }

    return "ok";
};

/** A progress that counts nothing, for a dry-run or a phase with no items. */
const NO_PROGRESS: Progress = {
    tick: () => undefined,
    fail: (message) => Logger.error(message),
    printLine: (text) => Logger.log(text),
    finish: () => undefined,
    snapshot: () => "",
};

const writeAssetMetadata = async ({
    asset,
    assetName,
    targetAssetId,
    targetSpace,
    internalTagMapping,
    failures,
    matched,
    output,
    progress,
}: {
    asset: any;
    assetName: string;
    targetAssetId: number;
    targetSpace: string;
    internalTagMapping: Map<number, number>;
    failures: CopyRunFailure[];
    matched: boolean;
    output?: CopyOutput;
    progress?: Progress;
}): Promise<CopyItemOutcome> => {
    const payload = getAssetMetadataPayload(asset, internalTagMapping);

    if (Object.keys(payload).length === 0) {
        return matched ? "matched" : "created";
    }

    try {
        await managementApi.assets.updateAsset(
            {
                spaceId: targetSpace,
                assetId: targetAssetId,
                payload,
                quiet: output?.quiet,
            },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );
    } catch (error) {
        const status = resolveThrownStatus(error);
        const message = `Asset '${assetName}' was copied as target asset '${targetAssetId}', but its metadata (alt, title, copyright) could not be written${status ? ` (status ${status})` : ""}: ${describeThrown(error)}.`;

        // Through the progress, so the message owns its own row instead of
        // landing inside a half-drawn live line.
        (progress ?? NO_PROGRESS).fail(`✘ ${message}`);
        failures.push({
            resource: "asset",
            name: assetName,
            phase: "update",
            ...(status ? { status } : {}),
            message,
            sourceId: Number(asset.id),
            targetId: targetAssetId,
        });

        return "update_failed";
    }

    return matched ? "matched" : "created";
};

/** Both spaces' asset tags, read the only way a personal token may read them. */
const readInternalTagPlan = async ({
    sourceSpace,
    targetSpace,
    assets,
    ledgerTagIds,
}: {
    sourceSpace: string;
    targetSpace: string;
    assets: any[];
    ledgerTagIds?: Map<number, number>;
}): Promise<CopyInternalTagPlan> => {
    const readTags = async (spaceId: string) => {
        const result = await managementApi.internalTags.getAllInternalTags(
            { spaceId, objectType: "asset" },
            { ...apiConfig, spaceId },
        );

        return (result?.internal_tags ?? []).map((tag: any) => ({
            id: Number(tag.id),
            name: String(tag.name ?? ""),
        }));
    };

    const [sourceTags, targetTags] = await Promise.all([
        readTags(sourceSpace),
        readTags(targetSpace),
    ]);

    return buildCopyInternalTagPlan({
        sourceTags,
        targetTags,
        assets,
        ledgerTagIds,
    });
};

const getAssetMetadataPayload = (
    asset: any,
    internalTagMapping?: Map<number, number>,
) => {
    // Only ids the target really has: one unknown id makes Storyblok reject the
    // whole payload, and alt, title and copyright are lost with it.
    const mappedTagIds = assetInternalTagIds(asset)
        .map((id) => internalTagMapping?.get(id))
        .filter((id): id is number => id !== undefined);

    return getAssetMetadataPayloadFields(asset, mappedTagIds);
};

const getAssetMetadataPayloadFields = (
    asset: any,
    internalTagIds: number[],
) => ({
    ...(asset.alt ? { alt: asset.alt } : {}),
    ...(asset.title ? { title: asset.title } : {}),
    ...(asset.copyright ? { copyright: asset.copyright } : {}),
    ...(asset.source ? { source: asset.source } : {}),
    ...(asset.focus ? { focus: asset.focus } : {}),
    ...(asset.meta_data ? { meta_data: asset.meta_data } : {}),
    ...(asset.is_private === undefined ? {} : { is_private: asset.is_private }),
    ...(asset.locked === undefined ? {} : { locked: asset.locked }),
    ...(asset.publish_at === undefined ? {} : { publish_at: asset.publish_at }),
    ...(internalTagIds.length ? { internal_tag_ids: internalTagIds } : {}),
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
    selection,
    input,
    graph,
    manifestPaths,
    assetFoldersCreated,
    assetFoldersMatched,
    assetsCreated,
    assetsMatched,
    items,
    failures,
    internalTags,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopyAssetsSelection;
    input: Record<string, any>;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    manifestPaths: ReturnType<typeof getDefaultCopyManifestPaths>;
    assetFoldersCreated: number;
    assetFoldersMatched: number;
    assetsCreated: number;
    assetsMatched: number;
    items: CopyAssetsApplyItem[];
    failures: CopyRunFailure[];
    internalTags: CopyInternalTagsReport;
}): CopyAssetsApplyReport => ({
    schemaVersion: 1,
    command: "copy assets",
    dryRun: false,
    generatedAt: graph.generatedAt,
    input,
    normalized: {
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        selection: toSelectionReport(selection),
    },
    summary: {
        assetFoldersCreated,
        assetFoldersMatched,
        assetsCreated,
        assetsMatched,
        warnings: graph.warnings.length,
        errors: graph.errors.length,
        outcomes: countCopyOutcomes(items.map((item) => item.outcome)),
        failed: failures.length,
    },
    internalTags,
    graph,
    items,
    failures,
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

const countTreeStories = (nodes: any[]): { folders: number; stories: number } =>
    nodes.reduce(
        (counts, node) => {
            const childCounts = countTreeStories(node.children ?? []);

            return {
                folders:
                    counts.folders +
                    childCounts.folders +
                    (node.story?.is_folder ? 1 : 0),
                stories:
                    counts.stories +
                    childCounts.stories +
                    (node.story?.is_folder ? 0 : 1),
            };
        },
        { folders: 0, stories: 0 },
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

interface ComponentCompatibilityFinding {
    sourceStoryId: number;
    sourceFullSlug: string;
    component: string;
    path: string;
    uid?: string;
    field?: string;
    parentComponent?: string;
    reason: "missing_in_target" | "not_allowed_in_field";
}

// Build a validator from the TARGET space component schemas so the dry-run can
// say what the editor will flag. Neither finding blocks a write: Storyblok saves
// unknown components and whitelist violations alike. Two problems are detected:
//   - a component used in a source story does not exist in the target space
//   - a component sits in a bloks field whose target schema restricts the
//     allowed components and does not include it
const buildTargetComponentValidator = async (targetSpace: string) => {
    const components = await managementApi.components.getAllComponents({
        ...apiConfig,
        spaceId: targetSpace,
    });
    const list = Array.isArray(components) ? components : [];

    const targetComponentNames = new Set<string>(
        list.map((component: any) => component?.name).filter(Boolean),
    );
    const schemaByName = new Map<string, any>(
        list
            .filter((component: any) => component?.name)
            .map((component: any) => [component.name, component.schema ?? {}]),
    );
    const componentsByGroupUuid = new Map<string, Set<string>>();
    for (const component of list) {
        const groupUuid = component?.component_group_uuid;
        if (!component?.name || !groupUuid) {
            continue;
        }
        const existing =
            componentsByGroupUuid.get(String(groupUuid)) ?? new Set<string>();
        existing.add(component.name);
        componentsByGroupUuid.set(String(groupUuid), existing);
    }

    // Allowed child components for a restricted bloks field, or undefined when
    // the field is unrestricted or cannot be resolved with confidence (which
    // keeps the dry-run free of false positives).
    const resolveAllowedComponents = (
        parentComponent: string | undefined,
        field: string | undefined,
    ): Set<string> | undefined => {
        if (!parentComponent || !field) {
            return undefined;
        }

        const fieldDef = schemaByName.get(parentComponent)?.[field];

        if (!fieldDef || fieldDef.type !== "bloks") {
            return undefined;
        }

        if (fieldDef.restrict_components !== true) {
            return undefined;
        }

        // Tag-based whitelists reference internal tag ids we do not resolve.
        if (fieldDef.restrict_type === "tags") {
            return undefined;
        }

        const allowed = new Set<string>();

        for (const name of fieldDef.component_whitelist ?? []) {
            if (typeof name === "string") {
                allowed.add(name);
            }
        }

        for (const groupUuid of fieldDef.component_group_whitelist ?? []) {
            const names = componentsByGroupUuid.get(String(groupUuid));
            if (names) {
                names.forEach((name) => allowed.add(name));
            }
        }

        return allowed;
    };

    return {
        // With no components fetched we cannot validate anything; skip instead
        // of reporting every component as missing.
        canValidate: targetComponentNames.size > 0,
        /** The target's component schemas, by name, for the schema drift check. */
        targetSchemas: Object.fromEntries(schemaByName) as Record<
            string,
            Record<string, any>
        >,
        validateStory(story: any): ComponentCompatibilityFinding[] {
            const findings: ComponentCompatibilityFinding[] = [];

            walkContentBloks(story?.content, (blok) => {
                const base = {
                    sourceStoryId: Number(story?.id),
                    sourceFullSlug: String(
                        story?.full_slug ?? story?.slug ?? "",
                    ),
                    component: blok.component,
                    path: blok.path,
                    uid: blok.uid,
                    field: blok.field,
                    parentComponent: blok.parentComponent,
                };

                if (!targetComponentNames.has(blok.component)) {
                    findings.push({ ...base, reason: "missing_in_target" });
                    return;
                }

                const allowed = resolveAllowedComponents(
                    blok.parentComponent,
                    blok.field,
                );

                if (allowed && !allowed.has(blok.component)) {
                    findings.push({
                        ...base,
                        reason: "not_allowed_in_field",
                    });
                }
            });

            return findings;
        },
    };
};

/**
 * What the target will do with the content before anything is written: which
 * components it does not know (saved, shown as unknown in the editor), which
 * sit outside a field's whitelist (saved, flagged as out of schema), and which
 * values have drifted from their field's type (rejected: the only will-fail).
 * The dry-run and the PLAN block both read it, so they state the same counts.
 */
const planSchemaPreflight = async ({
    targetSpace,
    sourceSchemas,
    sourceStories,
    plannedSourceStories,
}: {
    targetSpace: string;
    sourceSchemas: Record<string, any>;
    sourceStories: any[];
    plannedSourceStories: any[];
}) => {
    Logger.warning(
        "Checking source components and field values against the target space schema.",
    );

    const componentValidator = await buildTargetComponentValidator(targetSpace);
    const componentCompatibility = componentValidator.canValidate
        ? summarizeComponentCompatibility(
              true,
              sourceStories.flatMap((item: any) =>
                  componentValidator.validateStory(item?.story),
              ),
          )
        : summarizeComponentCompatibility(false, []);

    if (!componentCompatibility.checked) {
        Logger.warning(
            `Skipped component compatibility check because no components were returned for target space '${targetSpace}'.`,
        );
    }

    const schemaDrift = findSchemaDrift({
        stories: plannedSourceStories,
        targetSchemas: componentValidator.targetSchemas,
        sourceSchemas,
    });
    // Only schema drift makes Storyblok reject a write; unknown components and
    // whitelist violations are saved and flagged in the editor.
    const willFail = summarizeStoriesWillFail({ schemaDrift });

    return { componentCompatibility, schemaDrift, willFail };
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
    assetKey,
    copyMaps,
}: {
    assetId?: number;
    filename?: string;
    assetKey?: string;
    copyMaps: CopyMaps;
}): boolean =>
    (assetId !== undefined && copyMaps.assetIds.has(assetId)) ||
    (filename !== undefined && copyMaps.assetFilenames.has(filename)) ||
    (assetKey !== undefined && copyMaps.assetKeys.has(assetKey));

const annotateReferencesWithManifestMaps = ({
    graph,
    copyMaps,
    withAssets,
    classifyStories,
    unmappedSourceFullSlugs,
}: {
    graph: CopyGraph;
    copyMaps: CopyMaps;
    withAssets: boolean;
    /**
     * Only a story-copy run rewrites story references, so only it can promise
     * `will_relink` or warn `will_break`. Asset-only runs leave the scanner's
     * neutral `unclassified` status in place.
     */
    classifyStories: boolean;
    /**
     * Planned stories that will have no mapping when content is rewritten.
     * `copy stories` creates them all and passes nothing; `copy relink` passes
     * the stories missing from the target, whose references really do break.
     */
    unmappedSourceFullSlugs?: ReadonlySet<string>;
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

    if (!classifyStories) {
        return;
    }

    // Story references are classified against the copy plan as well as the
    // ledger: a reference into the selection relinks once phase 2 runs, one
    // that points outside it dangles. graph.stories already carries the plan.
    graph.storyReferences = classifyStoryReferences({
        storyReferences: graph.storyReferences,
        selection: buildCopyReferenceSelection(graph.stories, {
            excludeSourceFullSlugs: unmappedSourceFullSlugs,
        }),
        copyMaps,
        sameSpace: graph.sourceSpaceId === graph.targetSpaceId,
    });

    for (const group of groupBrokenStoryReferences(graph.storyReferences)) {
        graph.warnings.push({
            code: "broken_story_reference",
            message: `Story '${group.sourceStoryFullSlug}' references ${group.references.length} story/stories outside this copy that are not in the ledger; the copied content will point at nothing.`,
            path: group.references
                .map((reference) => reference.path)
                .join(", "),
            sourceValue: group.references.map(
                describeBrokenStoryReferenceTarget,
            ),
        });
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

        const sourceParentId = normalizeAssetFolderParentId(
            folder.sourceParentId,
        );
        folder.targetParentId =
            sourceParentId === null
                ? null
                : (copyMaps.assetFolderIds.get(sourceParentId) ?? null);
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

/**
 * The languages the target space has, or `undefined` when the space could not
 * be read. An unknown list is not an empty one: the caller carries everything
 * rather than drop a slug on a failed lookup.
 */
const getTargetLanguageCodes = async (
    targetSpace: string,
): Promise<string[] | undefined> => {
    const space: any = await managementApi.spaces.getSpace(
        { spaceId: targetSpace },
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );
    const languages = space?.space?.languages;

    if (!Array.isArray(languages)) {
        Logger.warning(
            `Could not read the languages of space '${targetSpace}'; translated slugs will be sent as they are and the API has the last word.`,
        );

        return undefined;
    }

    return languages
        .map((language: any) =>
            typeof language === "string" ? language : language?.code,
        )
        .filter((code: any): code is string => Boolean(code));
};

/**
 * Restricts the scan input to the stories the plan will actually write. The
 * selection fetch can return more than the plan (children mode fetches the
 * root folder but does not copy it); scanning those would attribute
 * references to a run that never touches them.
 */
const selectPlannedSourceStories = (
    sourceStories: any[],
    plan: CopyPlanItem[],
): any[] => {
    const plannedFullSlugs = new Set(plan.map((item) => item.sourceFullSlug));

    return sourceStories
        .map((item) => item?.story)
        .filter(
            (story) =>
                Boolean(story) &&
                plannedFullSlugs.has(String(story.full_slug ?? "")),
        );
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
    unmappedSourceFullSlugs,
    onScanProgress,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopySelection;
    destination: string | undefined;
    plan: CopyPlanItem[];
    sourceStories: any[];
    schemas: Record<string, any>;
    copyMaps: CopyMaps;
    /** Planned stories this run will not map; see the annotator. */
    unmappedSourceFullSlugs?: ReadonlySet<string>;
    onScanProgress?: (progress: {
        scanned: number;
        total: number;
        storyFullSlug?: string;
    }) => void;
}): CopyGraph => {
    const sourceStoryByFullSlug = new Map(
        sourceStories
            .map((item) => item?.story)
            .filter(Boolean)
            .map((story) => [String(story.full_slug ?? ""), story] as const),
    );
    const scanResult = scanStoriesReferences({
        stories: selectPlannedSourceStories(sourceStories, plan),
        schemas,
        options: {
            referencePolicy: "preserve",
            // Asset URLs written into text, HTML, link and plugin fields are
            // references too; only this space's own files are ours to follow.
            sourceSpaceId: sourceSpace,
            onProgress: onScanProgress,
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
        classifyStories: true,
        unmappedSourceFullSlugs,
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
    classifyStories,
    onScanProgress,
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
    classifyStories: boolean;
    onScanProgress?: (progress: {
        scanned: number;
        total: number;
        storyFullSlug?: string;
    }) => void;
}): CopyGraph => {
    const scanResult = scanStoriesReferences({
        stories: selectPlannedSourceStories(sourceStories, plan),
        schemas,
        options: {
            referencePolicy: "preserve",
            // Asset URLs written into text, HTML, link and plugin fields are
            // references too; only this space's own files are ours to follow.
            sourceSpaceId: sourceSpace,
            onProgress: onScanProgress,
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
    // The library answers a different host than the content writes, so a file
    // a story mentions only as a URL is found by its key or not at all.
    const referencedAssetKeys = new Set(
        scanResult.assetReferences
            .map((reference) => reference.assetKey)
            .filter((assetKey): assetKey is string => assetKey !== undefined),
    );
    const isReferencedAssetKey = (
        filename: unknown,
        keys: ReadonlySet<string>,
    ): boolean => {
        const assetKey = assetKeyOf(filename)?.key;

        return assetKey !== undefined && keys.has(assetKey);
    };
    const selectedAssets = sourceAssets.filter(
        (asset) =>
            referencedAssetIds.has(Number(asset.id)) ||
            referencedFilenames.has(String(asset.filename)) ||
            isReferencedAssetKey(asset.filename, referencedAssetKeys),
    );
    const selectedAssetIds = new Set(
        selectedAssets.map((asset) => Number(asset.id)),
    );
    const selectedFilenames = new Set(
        selectedAssets.map((asset) => String(asset.filename)),
    );
    const selectedAssetKeys = new Set(
        selectedAssets
            .map((asset) => assetKeyOf(asset.filename)?.key)
            .filter((assetKey): assetKey is string => assetKey !== undefined),
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
                    selectedFilenames.has(reference.filename)) ||
                (reference.assetKey !== undefined &&
                    selectedAssetKeys.has(reference.assetKey));

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
        classifyStories,
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

const countStoryItems = (sourceStories: any[]): number =>
    sourceStories.map((item) => item?.story).filter(Boolean).length;

const logReferenceScanProgress = ({
    scanned,
    total,
}: {
    scanned: number;
    total: number;
}) => {
    Logger.success(`Scanned ${scanned} of ${total} stories for references.`);
};

const shouldUsePublishedLayerCopy = (
    publication: CopyPublicationOptions,
    sourceStory: any,
    publishedLayerRecord?: PublishedLayerRecord,
): boolean =>
    // A folder is never published: see shouldPublishCopiedCurrentStory.
    sourceStory?.is_folder !== true &&
    publication.mode === "preserve-layers" &&
    resolveStoryLayerState(sourceStory) === "dirty-published" &&
    Boolean(publishedLayerRecord?.publishedLayerItem?.story);

const shouldPublishCopiedCurrentStory = (
    publication: CopyPublicationOptions,
    sourceStory: any,
): boolean => {
    // Folders are never published, in any publication mode. In Storyblok
    // "publish folder" is not a state of the folder but an action that
    // cascades to every descendant, so publishing one here would put each
    // child live as the empty shell phase 1 created, before its own content
    // update has run. Publish state is reproduced per story instead.
    if (sourceStory?.is_folder === true) {
        return false;
    }

    if (publication.mode === "save-only") {
        return false;
    }

    const layerState = resolveStoryLayerState(sourceStory);

    if (layerState === "clean-published") {
        return true;
    }

    if (layerState === "dirty-published") {
        return publication.mode === "collapse-draft";
    }

    return false;
};

const buildRewrittenStoryPayload = ({
    sourceStory,
    content,
    targetParentId,
    maps,
    schemas,
    targetLanguageCodes,
}: {
    sourceStory: any;
    content: any;
    targetParentId: number | null;
    maps: CopyMaps;
    schemas: CopyComponentSchemaRegistry;
    targetLanguageCodes?: string[];
}) => {
    const rewritten = rewriteCopyReferences({
        value: content ?? {},
        maps,
        schemas,
    });

    return {
        payload: buildFinalStoryPayload({
            sourceStory,
            targetParentId,
            rewrittenContent: rewritten.value,
            targetLanguageCodes,
        }),
        rewrittenReferences: rewritten.records.length,
    };
};

const publishCopiedStory = async ({
    storyId,
    story,
    publication,
    targetSpace,
}: {
    storyId: number;
    story: any;
    publication: CopyPublicationOptions;
    targetSpace: string;
}) => {
    const languages = publication.resolvedPublishLanguages;

    if (!languages || languages.length === 0) {
        return { ok: true, stage: "publish_skipped" };
    }

    return managementApi.stories.publishStoryLanguages(
        {
            storyId,
            story,
            languages,
        },
        {
            ...apiConfig,
            spaceId: targetSpace,
        },
    );
};

const rewriteCopiedStoryContents = async ({
    tree,
    realParentId,
    sourceStoryById,
    targetSlugBySourceSlug,
    publication,
    publishedLayerRecordBySourceId,
    sourceSpace,
    targetSpace,
    manifestRoot,
    targetLanguageCodes,
    skippedSourceIds,
    outcomes = new Map<string, CopyOutcomeRecord>(),
    output,
}: {
    tree: any[];
    realParentId: number | null;
    sourceStoryById: Map<number, any>;
    targetSlugBySourceSlug: Map<string, string>;
    publication: CopyPublicationOptions;
    publishedLayerRecordBySourceId: Map<string, PublishedLayerRecord>;
    sourceSpace: string;
    targetSpace: string;
    manifestRoot?: string;
    targetLanguageCodes?: string[];
    /** Items phase 1 could not create a parent for; never written here either. */
    skippedSourceIds?: Set<number>;
    /** Per source full_slug, what happened; shared with phase 1 and the report. */
    outcomes?: Map<string, CopyOutcomeRecord>;
    /** How this run talks while it works. */
    output?: CopyOutput;
}) => {
    const treeCounts = countTreeStories(tree);
    const progress = output
        ? output.phase("content", treeCounts.stories + treeCounts.folders)
        : NO_PROGRESS;
    /**
     * One place where a result is both remembered and shown: the progress can
     * never disagree with the report, because they are written together.
     */
    const recordOutcome = (
        fullSlug: string,
        record: CopyOutcomeRecord,
    ): void => {
        outcomes.set(fullSlug, record);
        progress.tick({
            name: fullSlug,
            outcome: toProgressOutcome(record.outcome),
        });
    };
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
    const failures: CopyRunFailure[] = [];

    const writeStoryMapping = async ({
        sourceStory,
        targetStory,
        targetFullSlug,
        action,
    }: {
        sourceStory: any;
        targetStory: any;
        targetFullSlug?: string;
        action: CopyStoryManifestEntry["action"];
    }) => {
        const entry: CopyStoryManifestEntry = {
            type: "story",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: Number(sourceStory.id),
            target_id: Number(targetStory.id),
            source_uuid: String(sourceStory.uuid),
            target_uuid: String(targetStory.uuid),
            source_full_slug: String(sourceStory.full_slug ?? ""),
            target_full_slug: targetStory.full_slug ?? targetFullSlug,
            action,
            created_at: new Date().toISOString(),
        };

        await appendCopyManifestEntry({
            combinedPath: manifestPaths.combined,
            resourcePath: manifestPaths.stories,
            entry,
        });
        applyStoryManifestEntryToMaps(maps, entry);

        return entry.target_id;
    };

    const createOrMatchReplacementShell = async ({
        node,
        sourceStory,
        parentId,
        staleTargetId,
    }: {
        node: any;
        sourceStory: any;
        parentId: number | null;
        staleTargetId?: number;
    }): Promise<
        number | { failed: true; status?: number; message: string }
    > => {
        const sourceFullSlug = String(sourceStory.full_slug ?? "");
        const targetFullSlug = targetSlugBySourceSlug.get(sourceFullSlug);
        const existingTargetStory = targetFullSlug
            ? await managementApi.stories.getStoryBySlug(targetFullSlug, {
                  ...apiConfig,
                  spaceId: targetSpace,
              })
            : undefined;

        if (
            existingTargetStory?.story?.id &&
            Number(existingTargetStory.story.id) !== staleTargetId
        ) {
            return writeStoryMapping({
                sourceStory,
                targetStory: existingTargetStory.story,
                targetFullSlug,
                action: "matched_by_target_key",
            });
        }

        const createdStoryResult = await managementApi.stories.createStory(
            buildStoryShellPayload(node.story ?? sourceStory, parentId),
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
            {
                publish: false,
            },
        );
        const targetStory = createdStoryResult?.story;

        if (!targetStory?.id || !targetStory?.uuid) {
            const existingAtPath = await findTargetStoryAtPlannedPath({
                plannedFullSlug: targetFullSlug,
                sourceStory,
                targetSpace,
            });

            if (existingAtPath && Number(existingAtPath.id) !== staleTargetId) {
                Logger.warning(
                    `Could not create '${sourceFullSlug}' (${describeCreateFailure(createdStoryResult)}), but a story already exists at '${existingAtPath.full_slug}' in the target; adopting it instead of creating a duplicate.`,
                );

                return writeStoryMapping({
                    sourceStory,
                    targetStory: existingAtPath,
                    targetFullSlug,
                    action: "matched_by_target_key",
                });
            }

            // Recorded by the caller like any failed create: never thrown out
            // of the shell phase after other shells were written.
            const status = Number(createdStoryResult?.status);

            return {
                failed: true,
                ...(Number.isFinite(status) && status > 0 ? { status } : {}),
                message: `Failed to create replacement target story for '${sourceFullSlug}' (${describeCreateFailure(createdStoryResult)}). Its children are skipped: they have no parent to be created under.`,
            };
        }

        return writeStoryMapping({
            sourceStory,
            targetStory,
            targetFullSlug,
            action: "created",
        });
    };

    const walk = async (nodes: any[], parentId: number | null) => {
        for (const node of nodes) {
            const sourceId = Number(node.id ?? node.story?.id);
            const sourceStory = sourceStoryById.get(sourceId);

            if (!sourceStory?.id) {
                continue;
            }

            // Phase 1 already reported these: their parent was never created,
            // so there is nothing here to write them under.
            if (skippedSourceIds?.has(sourceId)) {
                continue;
            }

            const sourceFullSlug = String(
                sourceStory.full_slug ?? sourceStory.slug ?? "",
            );
            // No target shell means children cannot be parented: each one is
            // reported as skipped, and the rest of the tree carries on.
            const skipChildrenOfFailedCreate = () =>
                skipSubtree(node, new Set<number>(), (childFullSlug) => {
                    recordOutcome(childFullSlug, {
                        outcome: "skipped_parent_failed",
                    });
                    Logger.error(
                        `  skipped: '${childFullSlug}', because its parent '${sourceFullSlug}' was not created.`,
                    );
                });

            // A replacement create that failed: recorded with its status, the
            // subtree skipped one line per child, and the tree carries on.
            const recordFailedReplacement = (failure: {
                status?: number;
                message: string;
            }) => {
                Logger.error(failure.message);
                failures.push({
                    resource: "story",
                    path: sourceFullSlug,
                    phase: "create",
                    ...(failure.status ? { status: failure.status } : {}),
                    message: failure.message,
                    sourceId: Number(sourceStory.id),
                });
                recordOutcome(sourceFullSlug, { outcome: "create_failed" });
                skipChildrenOfFailedCreate();
            };

            let targetStoryId = maps.storyIds.get(Number(sourceStory.id));
            if (!targetStoryId) {
                let replacement: Awaited<
                    ReturnType<typeof createOrMatchReplacementShell>
                >;

                try {
                    replacement = await createOrMatchReplacementShell({
                        node,
                        sourceStory,
                        parentId,
                    });
                } catch (error) {
                    replacement = {
                        failed: true,
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    };
                }

                if (typeof replacement !== "number") {
                    recordFailedReplacement(replacement);
                    continue;
                }

                targetStoryId = replacement;
            }

            // `phase` names the call whose result is returned, so a rejected
            // publish is never mistaken for content that was not written.
            // `publish` says whether this story ended up published.
            const writeStory = async (
                id: number,
            ): Promise<{
                result: any;
                phase: "update" | "publish";
                publish: "published" | "skipped" | "none";
                content: any;
                rewrittenReferences: number;
            }> => {
                const current = buildRewrittenStoryPayload({
                    sourceStory,
                    content: sourceStory.content,
                    targetParentId: parentId,
                    maps,
                    schemas,
                    targetLanguageCodes,
                });
                const publishedLayerRecord = publishedLayerRecordBySourceId.get(
                    String(sourceStory.id),
                );

                if (
                    shouldUsePublishedLayerCopy(
                        publication,
                        sourceStory,
                        publishedLayerRecord,
                    )
                ) {
                    const publishedLayerStory =
                        publishedLayerRecord?.publishedLayerItem?.story;
                    const publishedLayer = buildRewrittenStoryPayload({
                        sourceStory: publishedLayerStory,
                        content: publishedLayerStory?.content,
                        targetParentId: parentId,
                        maps,
                        schemas,
                        targetLanguageCodes,
                    });
                    const publishedUpdateResult =
                        await managementApi.stories.updateStory(
                            publishedLayer.payload,
                            String(id),
                            {
                                force_update: true,
                                publish: false,
                            },
                            {
                                ...apiConfig,
                                spaceId: targetSpace,
                            },
                        );

                    if (!publishedUpdateResult?.ok) {
                        return {
                            result: publishedUpdateResult,
                            phase: "update",
                            publish: "none",
                            content: publishedLayer.payload?.content,
                            rewrittenReferences:
                                current.rewrittenReferences +
                                publishedLayer.rewrittenReferences,
                        };
                    }

                    const publishResult = await publishCopiedStory({
                        storyId: id,
                        story: publishedLayer.payload,
                        publication,
                        targetSpace,
                    });

                    if (!publishResult?.ok) {
                        return {
                            result: publishResult,
                            phase: "publish",
                            publish: "none",
                            content: publishedLayer.payload?.content,
                            rewrittenReferences:
                                current.rewrittenReferences +
                                publishedLayer.rewrittenReferences,
                        };
                    }

                    const restoreDraftResult =
                        await managementApi.stories.updateStory(
                            current.payload,
                            String(id),
                            {
                                force_update: true,
                                publish: false,
                            },
                            {
                                ...apiConfig,
                                spaceId: targetSpace,
                            },
                        );

                    return {
                        result: restoreDraftResult,
                        phase: "update",
                        publish:
                            publishResult.stage === "publish_skipped"
                                ? "skipped"
                                : "published",
                        content: current.payload?.content,
                        rewrittenReferences:
                            current.rewrittenReferences +
                            publishedLayer.rewrittenReferences,
                    };
                }

                let publish: "published" | "skipped" | "none" = "none";

                if (
                    sourceStory.is_folder !== true &&
                    publication.mode === "preserve-layers" &&
                    resolveStoryLayerState(sourceStory) === "dirty-published"
                ) {
                    Logger.warning(
                        `Skipping publish for copied story '${sourceStory.full_slug ?? sourceStory.slug}' because source story has unpublished changes and no published layer could be resolved.`,
                    );
                    publish = "skipped";
                }

                const result = await managementApi.stories.updateStory(
                    current.payload,
                    String(id),
                    {
                        force_update: true,
                        publish: false,
                    },
                    {
                        ...apiConfig,
                        spaceId: targetSpace,
                    },
                );

                if (
                    result?.ok &&
                    shouldPublishCopiedCurrentStory(publication, sourceStory)
                ) {
                    const publishResult = await publishCopiedStory({
                        storyId: id,
                        story: current.payload,
                        publication,
                        targetSpace,
                    });

                    if (!publishResult?.ok) {
                        return {
                            result: publishResult,
                            phase: "publish",
                            publish: "none",
                            content: current.payload?.content,
                            rewrittenReferences: current.rewrittenReferences,
                        };
                    }

                    publish =
                        publishResult.stage === "publish_skipped"
                            ? "skipped"
                            : "published";
                }

                return {
                    result,
                    phase: "update",
                    publish,
                    content: current.payload?.content,
                    rewrittenReferences: current.rewrittenReferences,
                };
            };

            // A single broken story (e.g. a component the target space schema
            // rejects) must not abort the whole run. Record the failure, keep
            // its already-created shell as the parent for descendants, and move
            // on to the next story.
            let targetInvalidated = false;
            let update: Awaited<ReturnType<typeof writeStory>> | undefined;

            try {
                update = await writeStory(Number(targetStoryId));

                if (
                    update.phase === "update" &&
                    isStoryUpdateNotFound(update.result)
                ) {
                    Logger.warning(
                        `Ignoring stale story manifest mapping for '${sourceStory.full_slug ?? sourceStory.slug}' because target story '${targetStoryId}' could not be updated in space '${targetSpace}'.`,
                    );
                    maps.storyIds.delete(Number(sourceStory.id));
                    maps.storyUuids.delete(String(sourceStory.uuid));
                    targetInvalidated = true;

                    const replacement = await createOrMatchReplacementShell({
                        node,
                        sourceStory,
                        parentId,
                        staleTargetId: Number(targetStoryId),
                    });

                    if (typeof replacement !== "number") {
                        recordFailedReplacement(replacement);
                        continue;
                    }

                    targetStoryId = replacement;
                    targetInvalidated = false;
                    update = await writeStory(Number(targetStoryId));
                }

                const targetId = Number(targetStoryId);

                if (update.phase === "publish" && update.result?.ok === false) {
                    // The content is in the target; only its publish was
                    // refused. Reporting it as a failed update would tell the
                    // verifier the story is empty when it is not.
                    updatedStories += 1;
                    rewrittenReferences += update.rewrittenReferences;

                    const status = Number(update.result?.status);
                    const message = `Content of '${sourceFullSlug}' was written to target story '${targetId}', but publishing it failed (${describeCreateFailure(update.result)}). It is not published in the target.`;

                    Logger.error(message);
                    failures.push({
                        resource: "story",
                        path: sourceFullSlug,
                        phase: "publish",
                        ...(Number.isFinite(status) && status > 0
                            ? { status }
                            : {}),
                        message,
                        sourceId: Number(sourceStory.id),
                        targetId,
                    });
                    recordOutcome(sourceFullSlug, {
                        outcome: "publish_skipped",
                        targetId,
                    });
                } else {
                    assertStoryUpdateSucceeded({
                        result: update.result,
                        sourceStory,
                        targetStoryId: targetId,
                        targetSpace,
                        content: update.content,
                    });
                    updatedStories += 1;
                    rewrittenReferences += update.rewrittenReferences;
                    recordOutcome(sourceFullSlug, {
                        outcome:
                            update.publish === "published"
                                ? "published"
                                : update.publish === "skipped"
                                  ? "publish_skipped"
                                  : "updated",
                        targetId,
                    });
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                Logger.error(message);

                if (targetInvalidated) {
                    // The mapped story was gone and its replacement could not
                    // be created: there is nothing to parent the children under.
                    failures.push({
                        resource: "story",
                        path: sourceFullSlug,
                        phase: "create",
                        message,
                        sourceId: Number(sourceStory.id),
                    });
                    recordOutcome(sourceFullSlug, { outcome: "create_failed" });
                    skipChildrenOfFailedCreate();
                } else {
                    const status = Number(update?.result?.status);
                    const targetId = targetStoryId
                        ? Number(targetStoryId)
                        : undefined;

                    failures.push({
                        resource: "story",
                        path: sourceFullSlug,
                        phase: "update",
                        ...(Number.isFinite(status) && status > 0
                            ? { status }
                            : {}),
                        message,
                        sourceId: Number(sourceStory.id),
                        ...(targetId !== undefined ? { targetId } : {}),
                    });
                    recordOutcome(sourceFullSlug, {
                        outcome: "update_failed",
                        ...(targetId !== undefined ? { targetId } : {}),
                    });
                }
            }

            // Only recurse into children when we still have a usable target
            // shell to parent them under.
            if (!targetInvalidated && targetStoryId) {
                await walk(node.children ?? [], Number(targetStoryId));
            }
        }
    };

    await walk(tree, realParentId);
    await dedupeManifestFile(manifestPaths.stories);
    await dedupeManifestFile(manifestPaths.combined);

    if (updatedStories > 0) {
        Logger.success(
            `Updated ${updatedStories} copied story/story shell(s); rewrote ${rewrittenReferences} reference(s).`,
        );
    }

    if (failures.length > 0) {
        Logger.error(
            `${failures.length} story/story shell update(s) failed; the rest of the copy still completed. Failed stories:`,
        );
        for (const failure of failures) {
            const targetLabel = failure.targetId
                ? `, target id ${failure.targetId}`
                : "";
            Logger.error(
                `  - ${failure.path || "<unknown>"} (source id ${failure.sourceId}${targetLabel}) [${failure.phase}]`,
            );
        }

        // Every story was still attempted. The caller writes the report and
        // sets the exit code: throwing here would lose the report.
    }

    progress.finish();

    return { updatedStories, rewrittenReferences, failures };
};

const createStoriesAndWriteManifests = async ({
    tree,
    realParentId,
    sourceStoryById,
    targetSlugBySourceSlug,
    sourceSpace,
    targetSpace,
    manifestRoot,
    outcomes = new Map<string, CopyOutcomeRecord>(),
    output,
}: {
    tree: any[];
    realParentId: number | null;
    sourceStoryById: Map<number, any>;
    targetSlugBySourceSlug: Map<string, string>;
    sourceSpace: string;
    targetSpace: string;
    manifestRoot?: string;
    /** Per source full_slug, what happened; shared with phase 2 and the report. */
    outcomes?: Map<string, CopyOutcomeRecord>;
    /** How this run talks while it works. */
    output?: CopyOutput;
}) => {
    const shellCounts = countTreeStories(tree);
    const progress = output
        ? output.phase("shells", shellCounts.stories + shellCounts.folders)
        : NO_PROGRESS;
    /** Remembered and shown together, so the two can never disagree. */
    const recordOutcome = (
        fullSlug: string,
        record: CopyOutcomeRecord,
    ): void => {
        outcomes.set(fullSlug, record);
        progress.tick({
            name: fullSlug,
            outcome: toProgressOutcome(record.outcome),
        });
    };
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: sourceSpace,
        targetSpaceId: targetSpace,
        rootDir: manifestRoot,
    });
    const existingManifestEntries = await loadManifest(manifestPaths.combined);
    const copyMaps = buildCopyMaps(existingManifestEntries);
    let storiesCreated = 0;
    let storiesMatched = 0;
    let storiesSkippedParentFailed = 0;
    const createFailures: CopyRunFailure[] = [];
    const skippedSourceIds = new Set<number>();

    const walk = async (nodes: any[], parentId: number | null) => {
        for (const node of nodes) {
            const sourceStory = sourceStoryById.get(
                Number(node.id ?? node.story.id),
            );
            const sourceFullSlug = String(
                sourceStory?.full_slug ?? node.story.full_slug ?? "",
            );
            const targetFullSlug = targetSlugBySourceSlug.get(sourceFullSlug);
            const skipChildren = () =>
                skipSubtree(node, skippedSourceIds, (childFullSlug) => {
                    recordOutcome(childFullSlug, {
                        outcome: "skipped_parent_failed",
                    });
                    Logger.error(
                        `  skipped: '${childFullSlug}', because its parent '${sourceFullSlug}' was not created.`,
                    );
                });

            if (!sourceStory?.uuid) {
                // Without a source uuid no ledger entry can be written, so the
                // story is not created: recorded, never thrown mid-run.
                const message = `Cannot write story manifest for '${sourceFullSlug}' because source uuid is missing. Its children are skipped: they have no parent to be created under.`;

                Logger.error(message);
                createFailures.push({
                    resource: "story",
                    path: sourceFullSlug,
                    phase: "create",
                    message,
                    ...(sourceStory?.id !== undefined
                        ? { sourceId: Number(sourceStory.id) }
                        : {}),
                });
                recordOutcome(sourceFullSlug, { outcome: "create_failed" });
                storiesSkippedParentFailed += skipChildren();
                continue;
            }

            const mappedTargetId = copyMaps.storyIds.get(
                Number(sourceStory.id),
            );

            if (mappedTargetId) {
                const mappedTargetStory = await getValidMappedTargetStory({
                    sourceStory,
                    targetStoryId: mappedTargetId,
                    targetFullSlug,
                    targetSpace,
                });

                if (mappedTargetStory) {
                    if (
                        targetFullSlug &&
                        !isStoryAtPlannedPath(mappedTargetStory, targetFullSlug)
                    ) {
                        // Moved: its children are looked for where it lives now.
                        rebasePlannedTargetSlugs(
                            targetSlugBySourceSlug,
                            targetFullSlug,
                            String(mappedTargetStory.full_slug ?? ""),
                        );
                    }

                    storiesMatched += 1;
                    recordOutcome(sourceFullSlug, {
                        outcome: "matched",
                        targetId: Number(mappedTargetId),
                    });
                    await walk(node.children ?? [], mappedTargetId);
                    continue;
                }

                copyMaps.storyIds.delete(Number(sourceStory.id));
                copyMaps.storyUuids.delete(String(sourceStory.uuid));
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
                applyStoryManifestEntryToMaps(copyMaps, entry);
                storiesMatched += 1;
                recordOutcome(sourceFullSlug, {
                    outcome: "matched",
                    targetId: entry.target_id,
                });

                await walk(node.children ?? [], entry.target_id);
                continue;
            }

            const createdStoryResult = await managementApi.stories.createStory(
                buildStoryShellPayload(node.story, parentId),
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
                {
                    publish: false,
                },
            );
            let targetStory = createdStoryResult?.story;
            let action: CopyStoryManifestEntry["action"] = "created";

            if (!targetStory?.id || !targetStory?.uuid) {
                // A failed create is never fatal. When a story already lives at
                // the planned path (Storyblok's `slug already taken`), adopt it:
                // crashing loses the run, creating again leaves a duplicate.
                const existingAtPath = await findTargetStoryAtPlannedPath({
                    plannedFullSlug: targetFullSlug,
                    sourceStory,
                    targetSpace,
                });

                if (!existingAtPath) {
                    createFailures.push({
                        resource: "story",
                        path: sourceFullSlug,
                        phase: "create",
                        ...(createdStoryResult?.status
                            ? { status: Number(createdStoryResult.status) }
                            : {}),
                        message: String(
                            createdStoryResult?.response ??
                                "the create response carried no story",
                        ),
                        sourceId: Number(sourceStory.id),
                    });
                    recordOutcome(sourceFullSlug, { outcome: "create_failed" });
                    Logger.error(
                        `Failed to create target story for '${sourceFullSlug}' (${describeCreateFailure(createdStoryResult)}). Its children are skipped: they have no parent to be created under.`,
                    );
                    storiesSkippedParentFailed += skipChildren();
                    continue;
                }

                Logger.warning(
                    `Could not create '${sourceFullSlug}' (${describeCreateFailure(createdStoryResult)}), but a story already exists at '${existingAtPath.full_slug}' in the target; adopting it instead of creating a duplicate.`,
                );
                targetStory = existingAtPath;
                action = "matched_by_target_key";
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
                action,
                created_at: createdAt,
            };

            await appendCopyManifestEntry({
                combinedPath: manifestPaths.combined,
                resourcePath: manifestPaths.stories,
                entry,
            });
            applyStoryManifestEntryToMaps(copyMaps, entry);
            if (action === "created") {
                storiesCreated += 1;
            } else {
                storiesMatched += 1;
            }
            recordOutcome(sourceFullSlug, {
                outcome: action === "created" ? "created" : "matched",
                targetId: entry.target_id,
            });

            await walk(node.children ?? [], entry.target_id);
        }
    };

    await walk(tree, realParentId);
    await dedupeManifestFile(manifestPaths.stories);
    await dedupeManifestFile(manifestPaths.combined);

    progress.finish();
    Logger.success(`Story manifest written to ${manifestPaths.stories}`);
    const plannedCounts = countTreeStories(tree);

    return {
        summary: {
            storyFoldersPlanned: plannedCounts.folders,
            storiesPlanned: plannedCounts.stories,
            storiesCreated,
            storiesMatched,
            storiesCreateFailed: createFailures.length,
            storiesSkippedParentFailed,
        },
        createFailures,
        skippedSourceIds,
    };
};

const copyAssetsAndWriteManifests = async ({
    sourceSpace,
    targetSpace,
    selection,
    input,
    graph,
    sourceAssets,
    sourceAssetFolders,
    outputPath,
    manifestRoot,
    output,
}: {
    sourceSpace: string;
    targetSpace: string;
    selection: CopyAssetsSelection;
    input: Record<string, any>;
    graph: ReturnType<typeof buildCopyAssetsGraph>;
    sourceAssets: any[];
    sourceAssetFolders: any[];
    outputPath?: string;
    manifestRoot?: string;
    output: CopyOutput;
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
        { spaceId: targetSpace, quiet: output.quiet },
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
    const items: CopyAssetsApplyItem[] = [];
    const failures: CopyRunFailure[] = [];
    // Source folders that do not exist in the target after this run, because
    // their create failed or their own parent's did. Nothing is created inside
    // them: it would land in the root, silently misplaced.
    const unavailableFolderIds = new Set<number>();

    // The tags before the first metadata write: every PUT below carries the
    // target's own ids, and a tag the target lacks is named, never invented.
    const internalTagPlan = await readInternalTagPlan({
        sourceSpace,
        targetSpace,
        assets: sourceAssets,
        ledgerTagIds: copyMaps.internalTagIds,
    });
    const internalTagsReport = toInternalTagsReport(internalTagPlan);
    const internalTagPlanLine = formatInternalTagsPlanLine(
        internalTagsReport,
        targetSpace,
    );

    const tagsRecordedAt = new Date().toISOString();

    for (const tag of internalTagPlan.matched) {
        const tagEntry: CopyInternalTagManifestEntry = {
            type: "internal_tag",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: tag.sourceId,
            target_id: tag.targetId,
            name: tag.name,
            object_type: "asset",
            action: "matched_by_target_key",
            created_at: tagsRecordedAt,
        };

        await appendCopyManifestEntry({
            combinedPath: manifestPaths.combined,
            resourcePath: manifestPaths.internalTags,
            entry: tagEntry,
        });
        applyCopyMapWrites(copyMaps, getCopyMapWrites(tagEntry));
    }

    Logger.warning(
        `Copying assets from space '${sourceSpace}' to space '${targetSpace}'.`,
    );

    if (internalTagPlanLine) {
        Logger.warning(internalTagPlanLine);
    }

    const folderProgress = output.phase(
        "asset folders",
        graph.assetFolders.length,
    );

    for (const folderNode of graph.assetFolders) {
        const sourceFolder = sourceFolderById.get(folderNode.sourceId);

        if (!sourceFolder) {
            folderProgress.tick({ outcome: "skipped" });
            continue;
        }

        const sourceParentId = normalizeAssetFolderParentId(
            sourceFolder.parent_id,
        );
        const folderName = String(
            folderNode.sourcePath || sourceFolder.name || folderNode.sourceId,
        );

        const mappedTargetFolderId = copyMaps.assetFolderIds.get(
            folderNode.sourceId,
        );

        if (mappedTargetFolderId) {
            folderNode.targetParentId =
                sourceParentId === null
                    ? null
                    : (copyMaps.assetFolderIds.get(sourceParentId) ?? null);
            folderNode.action = "match";
            assetFoldersMatched += 1;
            folderProgress.tick({ name: folderName, outcome: "ok" });
            items.push({
                resource: "asset_folder",
                sourceId: folderNode.sourceId,
                name: folderName,
                targetId: Number(mappedTargetFolderId),
                outcome: "matched",
            });
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
                source_parent_id: sourceParentId,
                target_parent_id: normalizeAssetFolderParentId(
                    existingTargetFolder.parent_id,
                ),
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
            folderProgress.tick({ name: folderName, outcome: "ok" });
            items.push({
                resource: "asset_folder",
                sourceId: folderNode.sourceId,
                name: folderName,
                targetId: entry.target_id,
                outcome: "matched",
            });
            continue;
        }

        if (
            sourceParentId !== null &&
            unavailableFolderIds.has(sourceParentId)
        ) {
            unavailableFolderIds.add(folderNode.sourceId);
            folderProgress.tick({ name: folderName, outcome: "skipped" });
            items.push({
                resource: "asset_folder",
                sourceId: folderNode.sourceId,
                name: folderName,
                outcome: "skipped_parent_failed",
            });
            Logger.error(
                `  skipped: asset folder '${folderName}', because its parent folder was not created.`,
            );
            continue;
        }

        const targetParentId =
            sourceParentId === null
                ? null
                : (copyMaps.assetFolderIds.get(sourceParentId) ?? null);
        let targetFolder: any;
        let createError: unknown;

        try {
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

            targetFolder = createdFolder?.asset_folder;
        } catch (error) {
            createError = error;
        }

        if (!targetFolder?.id) {
            const status = resolveThrownStatus(createError);
            const message = `Failed to create asset folder '${folderName}' in space '${targetSpace}'${status ? ` (status ${status})` : ""}: ${createError ? describeThrown(createError) : "the create response carried no asset folder"}. Nothing inside it is copied.`;

            Logger.error(message);
            failures.push({
                resource: "asset_folder",
                name: folderName,
                phase: "create",
                ...(status ? { status } : {}),
                message,
                sourceId: folderNode.sourceId,
            });
            unavailableFolderIds.add(folderNode.sourceId);
            folderProgress.tick({ name: folderName, outcome: "failed" });
            items.push({
                resource: "asset_folder",
                sourceId: folderNode.sourceId,
                name: folderName,
                outcome: "create_failed",
            });
            continue;
        }

        const entry: CopyAssetFolderManifestEntry = {
            type: "asset_folder",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: folderNode.sourceId,
            target_id: Number(targetFolder.id),
            source_name: String(sourceFolder.name ?? ""),
            target_name: String(targetFolder.name ?? ""),
            source_parent_id: sourceParentId,
            target_parent_id: normalizeAssetFolderParentId(
                targetFolder.parent_id,
            ),
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
        folderProgress.tick({ name: folderName, outcome: "ok" });
        items.push({
            resource: "asset_folder",
            sourceId: folderNode.sourceId,
            name: folderName,
            targetId: entry.target_id,
            outcome: "created",
        });
    }

    folderProgress.finish();

    // The plan's own count: a source asset outside this selection is not an
    // item of this phase, so it neither counts nor ticks.
    const assetProgress = output.phase("assets", graph.assets.length);

    for (const asset of sourceAssets) {
        const graphAsset = graphAssetBySourceId.get(Number(asset.id));

        if (!graphAsset) {
            continue;
        }

        const assetName = String(asset.filename ?? asset.id);
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
            // An asset the ledger already maps still gets its metadata: the
            // rehearsal lost 99 alt texts to a rejected tag id, and this is
            // the run that puts them back.
            const ledgerMatchedOutcome = await writeAssetMetadata({
                asset,
                assetName,
                targetAssetId: Number(mappedTargetAsset.id),
                targetSpace,
                internalTagMapping: internalTagPlan.mapping,
                failures,
                matched: true,
                output,
                progress: assetProgress,
            });

            assetProgress.tick({
                name: getFileName(asset.filename),
                outcome: toProgressOutcome(ledgerMatchedOutcome),
            });
            items.push({
                resource: "asset",
                sourceId: Number(asset.id),
                name: assetName,
                targetId: Number(mappedTargetAsset.id),
                outcome: ledgerMatchedOutcome,
            });
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
            applyCopyMapWrites(
                copyMaps,
                getCopyAssetMapWrites({
                    sourceId: entry.source_id,
                    sourceFilename: entry.source_filename,
                    targetId: entry.target_id,
                    targetFilename: entry.target_filename,
                }),
            );
            graphAsset.targetFilename = entry.target_filename;
            graphAsset.targetAssetFolderId = entry.target_asset_folder_id;
            graphAsset.action = "match";
            assetsMatched += 1;
            // A matched asset still gets its metadata written: this is how an
            // asset whose earlier copy lost its alt to a rejected tag id gets
            // it back, and how a tag created in the UI since then is attached.
            const matchedOutcome = await writeAssetMetadata({
                asset,
                assetName,
                targetAssetId: Number(entry.target_id),
                targetSpace,
                internalTagMapping: internalTagPlan.mapping,
                failures,
                matched: true,
                output,
                progress: assetProgress,
            });

            assetProgress.tick({
                name: getFileName(asset.filename),
                outcome: toProgressOutcome(matchedOutcome),
            });
            items.push({
                resource: "asset",
                sourceId: Number(asset.id),
                name: assetName,
                targetId: entry.target_id,
                outcome: matchedOutcome,
            });
            continue;
        }

        if (
            asset.asset_folder_id !== null &&
            asset.asset_folder_id !== undefined &&
            unavailableFolderIds.has(Number(asset.asset_folder_id))
        ) {
            assetProgress.tick({
                name: getFileName(asset.filename),
                outcome: "skipped",
            });
            items.push({
                resource: "asset",
                sourceId: Number(asset.id),
                name: assetName,
                outcome: "skipped_parent_failed",
            });
            assetProgress.fail(
                `  skipped: asset '${assetName}', because its asset folder was not created.`,
            );
            continue;
        }

        let targetAsset: any;
        let createError: unknown;

        try {
            const pathToFile = await managementApi.assets.downloadAsset(
                { payload: asset, quiet: output.quiet },
                apiConfig,
            );

            targetAsset = await managementApi.assets.createAssetAndFinalize(
                {
                    quiet: output.quiet,
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
        } catch (error) {
            createError = error;
        }

        if (!targetAsset?.id) {
            const status = resolveThrownStatus(createError);
            const message = `Failed to copy asset '${assetName}' into space '${targetSpace}'${status ? ` (status ${status})` : ""}: ${createError ? describeThrown(createError) : "the upload response carried no asset"}.`;

            assetProgress.fail(`✘ ${message}`);
            failures.push({
                resource: "asset",
                name: assetName,
                phase: "create",
                ...(status ? { status } : {}),
                message,
                sourceId: Number(asset.id),
            });
            assetProgress.tick({
                name: getFileName(asset.filename),
                outcome: "failed",
            });
            items.push({
                resource: "asset",
                sourceId: Number(asset.id),
                name: assetName,
                outcome: "create_failed",
            });
            continue;
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
        applyCopyMapWrites(
            copyMaps,
            getCopyAssetMapWrites({
                sourceId: entry.source_id,
                sourceFilename: entry.source_filename,
                targetId: entry.target_id,
                targetFilename: entry.target_filename,
            }),
        );
        graphAsset.targetFilename = entry.target_filename;
        graphAsset.targetAssetFolderId = entry.target_asset_folder_id;
        graphAsset.action = "create";
        assetsCreated += 1;

        // The ledger entry is written first: the asset exists in the target
        // now, and a rerun must find it even if its metadata never lands.
        let outcome: CopyItemOutcome = "created";

        outcome = await writeAssetMetadata({
            asset,
            assetName,
            targetAssetId: Number(targetAsset.id),
            targetSpace,
            internalTagMapping: internalTagPlan.mapping,
            failures,
            matched: false,
            output,
            progress: assetProgress,
        });

        assetProgress.tick({
            name: getFileName(asset.filename),
            outcome: toProgressOutcome(outcome),
        });
        items.push({
            resource: "asset",
            sourceId: Number(asset.id),
            name: assetName,
            targetId: entry.target_id,
            outcome,
        });
    }

    assetProgress.finish();

    await dedupeManifestFile(manifestPaths.assetFolders);
    await dedupeManifestFile(manifestPaths.assets);
    await dedupeManifestFile(manifestPaths.combined);
    graph.limitations = [];

    const report = buildCopyAssetsApplyReport({
        sourceSpace,
        targetSpace,
        selection,
        input,
        graph,
        manifestPaths,
        assetFoldersCreated,
        assetFoldersMatched,
        assetsCreated,
        assetsMatched,
        items,
        failures,
        internalTags: internalTagsReport,
    });

    if (outputPath) {
        await writeJsonReport(outputPath, report);
    }

    if (failures.length > 0) {
        Logger.error(
            `Asset copy finished with ${failures.length} failed write(s); every other asset went through. Outcomes: ${formatCopyOutcomeCounts(report.summary.outcomes)}.`,
        );
        process.exitCode = 1;
    } else {
        Logger.success(
            `Asset copy complete. Created ${assetsCreated} asset(s), matched ${assetsMatched} asset(s).`,
        );
    }
    Logger.success(`Asset manifest written to ${manifestPaths.assets}`);
    Logger.success(
        `Asset folder manifest written to ${manifestPaths.assetFolders}`,
    );

    return report;
};

const logDryRunCopyPlan = async ({
    report,
    translatedSlugs,
}: {
    report: CopyDryRunReport;
    translatedSlugs?: CopyTranslatedSlugSummary;
}) => {
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

    if (translatedSlugs) {
        for (const line of describeCopyTranslatedSlugs({
            summary: translatedSlugs,
            targetSpaceId: report.normalized.targetSpaceId,
        })) {
            Logger.warning(`[dry-run] ${line}`);
        }
    }

    Logger.warning(
        `[dry-run] Would create ${report.items.length} story/folder item(s):`,
    );

    const plannedFolders = report.items.filter(
        (item: { type: string }) => item.type === "folder",
    ).length;

    if (plannedFolders > 0) {
        // Folders are never published (MAR-3055): a folder publish cascades to
        // every descendant, so publish state is reproduced per story instead.
        Logger.warning(
            `[dry-run] folders: ${plannedFolders} (never published)`,
        );
    }

    for (const item of report.items) {
        Logger.warning(
            `[dry-run]   ${item.type.padEnd(6)} ${item.targetFullSlug || "<root>"}${describeLedgerMatch(item.ledger)}`,
        );
    }

    if (report.graph) {
        Logger.warning(
            `[dry-run] Would plan ${report.summary.assetFolders} referenced asset folder(s) and ${report.summary.assets} referenced asset(s).`,
        );
        Logger.warning(
            `[dry-run] Asset refs: ${report.summary.assetReferencesMapped} mapped, ${report.summary.assetReferencesPlanned} planned, ${report.summary.assetReferencesUnresolved} unresolved.`,
        );

        if (report.assetReferenceSummary) {
            Logger.warning(
                `[dry-run] Unique asset refs: ${report.assetReferenceSummary.mapped.uniqueAssets} mapped, ${report.assetReferenceSummary.planned.uniqueAssets} planned, ${report.assetReferenceSummary.unresolved.uniqueAssets} unresolved.`,
            );

            // Only worth a line when a story really holds one: a space with no
            // string URLs reads exactly as it did before.
            if (report.assetReferenceSummary.byShape.string.occurrences > 0) {
                Logger.warning(
                    `[dry-run] Asset refs by shape: ${report.assetReferenceSummary.byShape.object.occurrences} in asset fields, ${report.assetReferenceSummary.byShape.string.occurrences} as URLs in text (${report.assetReferenceSummary.byShape.string.uniqueAssets} unique asset(s)).`,
                );
            }

            for (const foreignSpace of report.assetReferenceSummary
                .foreignAssetSpaces) {
                Logger.warning(
                    `[dry-run] Foreign asset space ${foreignSpace.spaceId}: ${foreignSpace.occurrences} occurrence(s), ${foreignSpace.uniqueAssets} unique asset(s).`,
                );
            }
        }

        Logger.warning(
            `[dry-run] Story refs: ${report.summary.storyReferencesWillRelink} will relink, ${report.summary.storyReferencesWillBreak} will break, ${report.summary.storyReferencesExternalKept} external kept, ${report.summary.storyReferencesUnresolved} unresolved.`,
        );

        if (report.summary.storyReferencesWillBreak > 0) {
            Logger.error(
                `[dry-run] ${report.summary.storyReferencesWillBreak} story reference(s) WILL BREAK: they point at stories outside this copy and are not in the ledger, so the copied content will point at nothing.`,
            );

            for (const group of groupBrokenStoryReferences(
                report.graph.storyReferences,
            )) {
                Logger.error(`[dry-run]   ${group.sourceStoryFullSlug}`);

                for (const reference of group.references) {
                    Logger.error(
                        `[dry-run]     ${reference.path} -> ${describeBrokenStoryReferenceTarget(reference)}`,
                    );
                }
            }
        }

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

    const compatibility = report.componentCompatibility;

    if (compatibility && !compatibility.checked) {
        Logger.warning(
            "[dry-run] Component compatibility check skipped (no target components resolved).",
        );
    } else if (compatibility && compatibility.findings.length === 0) {
        Logger.success(
            "[dry-run] All source components exist in the target space schema and are allowed in their fields.",
        );
    } else if (compatibility) {
        // Group by component so the output stays readable when the same
        // component is used across many stories.
        const printGroups = (
            findings: typeof compatibility.findings,
            reasonLabel: string,
            log: (message: string) => void,
        ) => {
            const grouped = new Map<string, typeof compatibility.findings>();

            for (const finding of findings) {
                grouped.set(finding.component, [
                    ...(grouped.get(finding.component) ?? []),
                    finding,
                ]);
            }

            for (const [component, bucket] of grouped) {
                const example = bucket[0];
                const contextParts = [
                    example?.field ? `field '${example.field}'` : undefined,
                    example?.parentComponent
                        ? `component '${example.parentComponent}'`
                        : undefined,
                    example?.uid ? `_uid ${example.uid}` : undefined,
                ].filter(Boolean);
                const exampleLabel = example
                    ? ` e.g. '${example.sourceFullSlug}' at ${example.path}${
                          contextParts.length
                              ? ` (${contextParts.join(", ")})`
                              : ""
                      }`
                    : "";

                log(
                    `[dry-run]   ${component}: ${reasonLabel} — ${bucket.length} occurrence(s).${exampleLabel}`,
                );
            }
        };
        const notAllowed = compatibility.findings.filter(
            (finding) => finding.reason === "not_allowed_in_field",
        );
        const unknown = compatibility.findings.filter(
            (finding) => finding.reason === "missing_in_target",
        );

        if (notAllowed.length > 0) {
            // Storyblok does not enforce field whitelists on save either: the
            // editor flags the blok as out of schema. A warning, not a failure.
            Logger.warning(
                `[dry-run] ${notAllowed.length} component occurrence(s) sit in a field whose whitelist does not allow them; the write succeeds and the editor flags them as out of schema:`,
            );
            printGroups(notAllowed, "not allowed in the target field", (line) =>
                Logger.warning(line),
            );
        }

        if (unknown.length > 0) {
            // Storyblok saves a component it does not know; only the editor
            // notices. So this is a warning, not a predicted failure.
            Logger.warning(
                `[dry-run] ${unknown.length} component occurrence(s) are missing from the target space schema; they will render as unknown components in the editor, and the write succeeds:`,
            );
            printGroups(unknown, "missing from target space schema", (line) =>
                Logger.warning(line),
            );
        }
    }

    if (report.schemaDrift) {
        const [driftLine, ...driftGroups] = formatSchemaDriftLines(
            report.schemaDrift,
        );
        const logDrift = (message: string) =>
            report.schemaDrift && report.schemaDrift.occurrences > 0
                ? Logger.error(message)
                : Logger.success(message);

        logDrift(`[dry-run] ${driftLine}`);
        driftGroups.forEach((line) => logDrift(`[dry-run] ${line}`));
    }

    if (report.willFail && report.willFail.stories > 0) {
        Logger.error(`[dry-run] ${formatStoriesWillFailLine(report.willFail)}`);
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
    const selectionLabel =
        report.normalized.selection === "all"
            ? "all assets and asset folders"
            : report.normalized.selection.type === "referenced_by_stories"
              ? `referenced_by_stories ${report.normalized.selection.source} (${report.normalized.selection.mode})`
              : `${report.normalized.selection.type} ${report.normalized.selection.values.join(", ")}`;

    Logger.warning(
        "[dry-run] Copy assets preview only. No Storyblok writes will be made.",
    );
    Logger.warning(
        `[dry-run] Source space: ${report.normalized.sourceSpaceId}`,
    );
    Logger.warning(
        `[dry-run] Target space: ${report.normalized.targetSpaceId}`,
    );
    Logger.warning(`[dry-run] Selection: ${selectionLabel}`);
    Logger.warning(
        `[dry-run] Would plan ${report.summary.assetFolders} asset folder(s) and ${report.summary.assets} asset(s).`,
    );

    const internalTagsLine = formatInternalTagsPlanLine(
        report.internalTags,
        report.normalized.targetSpaceId,
    );

    if (internalTagsLine) {
        Logger.warning(`[dry-run]${internalTagsLine}`);
    }

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

/**
 * The single gate between planning and the first API write. `--yes` passes
 * it (the plan still prints); without a terminal there is nobody to ask, so
 * the run refuses rather than guessing.
 */
const confirmCopyPlan = async ({ yes }: { yes: boolean }): Promise<boolean> => {
    if (yes) {
        Logger.log("Continuing without confirmation (--yes).");
        return true;
    }

    if (!process.stdin.isTTY) {
        Logger.error(
            "Refusing to write without confirmation: no interactive terminal. Re-run with --yes to continue, or --dry-run to only plan.",
        );
        process.exitCode = 1;
        return false;
    }

    const confirmed = await askYesNo("Continue? [y/N]");

    if (!confirmed) {
        Logger.warning("Copy aborted before any write.");
    }

    return confirmed;
};

type CopyRelinkMatchRecord = {
    item: CopyPlanItem;
    sourceStory?: any;
    targetStory?: any;
    match: CopyRelinkMatch;
    rewrite?: CopyRelinkStoryRewrite;
};

/**
 * Finds the story each planned item already has in the target space: through a
 * still-valid ledger mapping first, then by target path. Read-only — adopted
 * mappings are recorded only once the operator has confirmed the plan.
 */
const matchRelinkTargets = async ({
    plan,
    sourceStories,
    copyMaps,
    targetSpace,
}: {
    plan: CopyPlanItem[];
    sourceStories: any[];
    copyMaps: CopyMaps;
    targetSpace: string;
}): Promise<CopyRelinkMatchRecord[]> => {
    const sourceStoryByFullSlug = new Map<string, any>(
        sourceStories
            .map((item: any) => item?.story)
            .filter(Boolean)
            .map((story: any) => [String(story.full_slug ?? ""), story]),
    );
    let checked = 0;

    Logger.warning(
        `Matching ${plan.length} planned item(s) against stories in space '${targetSpace}'.`,
    );

    const records = await mapWithConcurrency(
        plan,
        TARGET_CONFLICT_CHECK_CONCURRENCY,
        async (item): Promise<CopyRelinkMatchRecord> => {
            const sourceStory = sourceStoryByFullSlug.get(item.sourceFullSlug);
            const mappedTargetId = sourceStory
                ? copyMaps.storyIds.get(Number(sourceStory.id))
                : undefined;
            let targetStory: any;
            let match: CopyRelinkMatch = "missing";

            if (sourceStory && mappedTargetId) {
                targetStory = await getValidMappedTargetStory({
                    sourceStory,
                    targetStoryId: mappedTargetId,
                    targetFullSlug: item.targetFullSlug,
                    targetSpace,
                    trashedNote:
                        "it is treated as not in the target, and nothing is rewritten through it",
                });

                if (targetStory) {
                    match = "ledger";
                }
            }

            if (!targetStory) {
                const existingTargetStory =
                    await managementApi.stories.getStoryBySlug(
                        item.targetFullSlug,
                        {
                            ...apiConfig,
                            spaceId: targetSpace,
                        },
                    );

                if (existingTargetStory?.story?.id) {
                    targetStory = existingTargetStory.story;
                    match = "adopted";
                }
            }

            checked += 1;
            if (
                checked === plan.length ||
                checked % 25 === 0 ||
                plan.length <= 25
            ) {
                Logger.success(
                    `Matched ${checked} of ${plan.length} planned item(s).`,
                );
            }

            return { item, sourceStory, targetStory, match };
        },
    );

    return records;
};

/**
 * Keeps only the out-of-selection ledger mappings whose target story is still
 * there, refreshed from the story the check just read. Relink writes THROUGH
 * these mappings, so an unchecked one turns a broken reference into a reference
 * to a story that no longer exists — the one outcome worse than leaving the
 * break alone — and a mapping trusted for its recorded path would rewrite
 * `cached_url` to wherever the story used to live. Only mappings the target
 * content actually mentions are checked, so the cost is bounded by the damage.
 */
const validateRelinkLedgerMappings = async ({
    mappings,
    targetSpace,
}: {
    mappings: CopyRelinkStoryMapping[];
    targetSpace: string;
}): Promise<{
    valid: CopyRelinkStoryMapping[];
    stale: CopyRelinkStoryMapping[];
}> => {
    if (mappings.length === 0) {
        return { valid: [], stale: [] };
    }

    Logger.warning(
        `Validating ${mappings.length} ledger mapping(s) referenced by the target content but outside this selection.`,
    );

    const checked = await mapWithConcurrency(
        mappings,
        TARGET_CONFLICT_CHECK_CONCURRENCY,
        async (mapping) => {
            const targetStory = await managementApi.stories.getStoryById(
                String(mapping.targetId),
                {
                    ...apiConfig,
                    spaceId: targetSpace,
                },
            );
            const foundUuid = targetStory?.story?.uuid;

            if (targetStory?.story?.id && isTrashedStory(targetStory.story)) {
                Logger.warning(
                    `Ledger mapping for '${mapping.sourceFullSlug || `#${mapping.sourceId}`}' points at a deleted story (trashed ${targetStory.story.deleted_at}); references to it are left as they are.`,
                );

                return { mapping, valid: false };
            }

            if (
                targetStory?.story?.id &&
                (!mapping.targetUuid ||
                    String(foundUuid) === mapping.targetUuid)
            ) {
                // The ledger records where the story was PUT; the target space
                // knows where it is now. A story moved since the copy keeps its
                // mapping and gets its current path.
                const foundFullSlug = targetStory.story.full_slug;

                return {
                    mapping: {
                        ...mapping,
                        targetFullSlug:
                            typeof foundFullSlug === "string" &&
                            foundFullSlug.length > 0
                                ? foundFullSlug
                                : mapping.targetFullSlug,
                    },
                    valid: true,
                };
            }

            Logger.warning(
                `Ignoring stale story manifest mapping for '${mapping.sourceFullSlug || `#${mapping.sourceId}`}' because target story '${mapping.targetId}' was not found in space '${targetSpace}'. References to it are left as they are.`,
            );

            return { mapping, valid: false };
        },
    );

    return {
        valid: checked
            .filter((result) => result.valid)
            .map((result) => result.mapping),
        stale: checked
            .filter((result) => !result.valid)
            .map((result) => result.mapping),
    };
};

/**
 * Keeps only the asset mappings whose target file is still in the target space,
 * with the filename that space reports today. Relink rewrites a story's image
 * fields through these exactly as it rewrites its links, so an unchecked
 * mapping points a live image at a deleted file — the ledger records what was
 * copied, and a later deletion in the target invalidates it just as thoroughly
 * as it invalidates a story mapping.
 */
const validateRelinkAssetMappings = async ({
    mappings,
    targetSpace,
}: {
    mappings: CopyRelinkAssetMapping[];
    targetSpace: string;
}): Promise<{
    valid: CopyRelinkAssetMapping[];
    stale: CopyRelinkAssetMapping[];
}> => {
    if (mappings.length === 0) {
        return { valid: [], stale: [] };
    }

    Logger.warning(
        `Validating ${mappings.length} asset mapping(s) referenced by the target content.`,
    );

    const checked = await mapWithConcurrency(
        mappings,
        TARGET_CONFLICT_CHECK_CONCURRENCY,
        async (mapping) => {
            const targetAsset: any = await managementApi.assets.getAssetById(
                { spaceId: targetSpace, assetId: mapping.targetId },
                apiConfig,
            );
            const foundFilename = targetAsset?.filename;

            if (
                Number(targetAsset?.id) === mapping.targetId &&
                typeof foundFilename === "string" &&
                foundFilename.length > 0
            ) {
                return {
                    mapping: { ...mapping, targetFilename: foundFilename },
                    valid: true,
                };
            }

            Logger.warning(
                `Ignoring stale asset manifest mapping for '${mapping.sourceFilename || `#${mapping.sourceId}`}' because target asset '${mapping.targetId}' was not found in space '${targetSpace}'. References to it are left as they are.`,
            );

            return { mapping, valid: false };
        },
    );

    return {
        valid: checked
            .filter((result) => result.valid)
            .map((result) => result.mapping),
        stale: checked
            .filter((result) => !result.valid)
            .map((result) => result.mapping),
    };
};

/**
 * The write half of `copy relink`: record the adopted mappings, then store the
 * rewritten content of every story whose references actually changed. Stories
 * that already point at the right target are never updated.
 */
const relinkTargetStories = async ({
    matches,
    manifestPaths,
    sourceSpace,
    targetSpace,
    output,
}: {
    matches: CopyRelinkMatchRecord[];
    manifestPaths: ReturnType<typeof getDefaultCopyManifestPaths>;
    sourceSpace: string;
    targetSpace: string;
    /** How this run talks while it works. */
    output?: CopyOutput;
}) => {
    let adopted = 0;
    const progress = output
        ? output.phase("relinking", matches.length)
        : NO_PROGRESS;

    for (const record of matches) {
        progress.tick({
            name: String(
                record.targetStory?.full_slug ??
                    record.sourceStory?.full_slug ??
                    "",
            ),
            outcome: record.match === "adopted" ? "ok" : "skipped",
        });
        if (
            record.match !== "adopted" ||
            !record.sourceStory?.uuid ||
            !record.targetStory?.uuid
        ) {
            continue;
        }

        const entry: CopyStoryManifestEntry = {
            type: "story",
            source_space_id: sourceSpace,
            target_space_id: targetSpace,
            source_id: Number(record.sourceStory.id),
            target_id: Number(record.targetStory.id),
            source_uuid: String(record.sourceStory.uuid),
            target_uuid: String(record.targetStory.uuid),
            source_full_slug: String(record.sourceStory.full_slug ?? ""),
            target_full_slug: String(
                record.targetStory.full_slug ?? record.item.targetFullSlug,
            ),
            action: "matched_by_target_key",
            created_at: new Date().toISOString(),
        };

        await appendCopyManifestEntry({
            combinedPath: manifestPaths.combined,
            resourcePath: manifestPaths.stories,
            entry,
        });
        adopted += 1;
    }

    if (adopted > 0) {
        await dedupeManifestFile(manifestPaths.stories);
        await dedupeManifestFile(manifestPaths.combined);
        Logger.success(
            `Recorded ${adopted} adopted target story mapping(s) in the ledger.`,
        );
    }

    let updatedStories = 0;
    let unchangedStories = 0;
    let rewrittenReferences = 0;
    let publishedStories = 0;
    const failures: CopyRunFailure[] = [];
    // Keyed by planned target full_slug, the key every relink plan item has.
    // A planned story missing from the target gets no outcome: nothing was
    // written and nothing could be.
    const outcomes = new Map<string, CopyOutcomeRecord>();

    for (const record of matches) {
        if (!record.targetStory) {
            continue;
        }

        const targetId = Number(record.targetStory.id);

        if (!record.rewrite) {
            outcomes.set(record.item.targetFullSlug, {
                outcome: "matched",
                targetId,
            });
            continue;
        }

        const targetLabel = String(
            record.targetStory.full_slug ?? record.item.targetFullSlug,
        );

        if (!record.rewrite.changed) {
            unchangedStories += 1;
            outcomes.set(record.item.targetFullSlug, {
                outcome: "matched",
                targetId,
            });
            continue;
        }

        const result = await managementApi.stories.updateStory(
            { ...record.targetStory, content: record.rewrite.content },
            String(record.targetStory.id),
            {
                publish: false,
                force_update: true,
            },
            {
                ...apiConfig,
                spaceId: targetSpace,
            },
        );

        try {
            assertStoryUpdateSucceeded({
                result,
                sourceStory: record.sourceStory ?? record.targetStory,
                targetStoryId: Number(record.targetStory.id),
                targetSpace,
                content: record.rewrite.content,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const status = Number(result?.status);

            Logger.error(message);
            failures.push({
                resource: "story",
                path: targetLabel,
                phase: "update",
                ...(Number.isFinite(status) && status > 0 ? { status } : {}),
                message,
                targetId,
            });
            outcomes.set(record.item.targetFullSlug, {
                outcome: "update_failed",
                targetId,
            });
            continue;
        }

        updatedStories += 1;
        rewrittenReferences += record.rewrite.rewrittenReferences;
        outcomes.set(record.item.targetFullSlug, {
            outcome: "updated",
            targetId,
        });

        if (record.targetStory.published === true) {
            publishedStories += 1;
        }

        Logger.success(
            `  ${targetLabel}: ${record.rewrite.rewrittenReferences} reference(s) rewritten.`,
        );
    }

    Logger.success(
        `Relinked ${updatedStories} story/stories in space '${targetSpace}'; rewrote ${rewrittenReferences} reference(s). ${unchangedStories} story/stories already resolved correctly and were left untouched.`,
    );

    if (publishedStories > 0) {
        Logger.warning(
            `${publishedStories} relinked story/stories are published in the target: the repair is in the DRAFT only. Publish them to update live content.`,
        );
    }

    if (failures.length > 0) {
        Logger.error(
            `${failures.length} story update(s) failed; the rest of the relink still completed. Failed stories:`,
        );

        for (const failure of failures) {
            Logger.error(`  - ${failure.path || "<unknown>"}`);
        }

        // The caller writes the report and sets the exit code: throwing here
        // would lose the report.
    }

    return {
        updatedStories,
        unchangedStories,
        rewrittenReferences,
        failures,
        outcomes,
    };
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
            const selections = resolveCopySelections(flags);
            const selection = toReportedSelection(selections);
            const dryRun = Boolean(flags["dryRun"]);
            const outputPath = readStringFlag(flags, ["outputPath"]);
            const manifestRoot = readStringFlag(flags, ["manifestRoot"]);
            const withAssets = Boolean(
                flags["withAssets"] ?? flags["with-assets"],
            );
            const yes = Boolean(flags["yes"]);
            const fresh = Boolean(flags["fresh"]);
            const destination = readStringFlag(flags, ["destination", "where"]);
            const copyOutput = resolveCopyOutput(flags);

            Logger.warning(
                `Copying stories from space '${sourceSpace}' to space '${targetSpace}'.`,
            );

            // '/' is turned into the roots it stands for before anything is
            // read in full, so the run can say what "everything" meant.
            const { selections: plannedSelections, expansion: rootExpansion } =
                await expandWholeSpaceSelections(
                    selections,
                    resolveRootExcludes(flags, selections),
                    sourceSpace,
                );

            Logger.log(
                formatCopySourcesLine({
                    selections,
                    selection,
                    destination,
                    sourceSpace,
                    expansion: rootExpansion,
                }),
            );

            // Every source value is read before the target is touched, so a
            // value that resolves to nothing fails first, and by name.
            const { sourceStories, roots: selectedRoots } =
                await collectSelectionForest(plannedSelections, sourceSpace);
            const publication = await resolveCopyPublicationOptions({
                flags,
                targetSpace,
                dryRun,
            });
            const destinationParentId = await resolveDestinationParentId(
                destination,
                targetSpace,
            );
            const rootsToCreate = prepareTreeForCreate(selectedRoots);

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
            const ledgerPath = path.resolve(manifestPaths.combined);
            // --fresh: the ledger on disk is read only to be announced; the
            // run plans and classifies against an empty one.
            const copyMaps = fresh
                ? createEmptyCopyMaps()
                : buildCopyMaps(manifestEntries);
            const ledger = {
                path: ledgerPath,
                entries: manifestEntries.length,
                ignored: fresh,
            };
            Logger.warning(
                fresh
                    ? `Ledger: ${manifestEntries.length} entr${manifestEntries.length === 1 ? "y" : "ies"} at ${ledgerPath} IGNORED (--fresh).`
                    : manifestEntries.length > 0
                      ? `Ledger: ${manifestEntries.length} entr${manifestEntries.length === 1 ? "y" : "ies"} loaded from ${ledgerPath} (resuming; use --fresh to ignore).`
                      : `Ledger: none at ${ledgerPath} (starting empty).`,
            );
            let dryRunGraph: CopyGraph | undefined;
            let withAssetsGraph: CopyGraph | undefined;
            let sourceAssets: any[] = [];
            let sourceAssetFolders: any[] = [];

            // Read once: the reference scan and the schema drift check (which
            // falls back to the source schema) both need it, in either mode.
            const sourceSchemasPromise =
                buildComponentSchemaRegistry(sourceSpace);

            // The reference scan runs in apply mode too: the plan gate needs
            // will-relink / will-break counts before the first write.
            {
                const schemasPromise = sourceSchemasPromise;

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
                    Logger.warning(
                        `Planning referenced assets from ${countStoryItems(sourceStories)} stories against ${sourceAssets.length} source asset(s).`,
                    );
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
                        classifyStories: true,
                        onScanProgress: logReferenceScanProgress,
                    });
                    Logger.success(
                        `Reference planning complete. Found ${withAssetsGraph.assets.length} referenced asset(s), ${withAssetsGraph.assetFolders.length} asset folder(s), ${withAssetsGraph.assetReferences.length} asset reference occurrence(s), and ${withAssetsGraph.storyReferences.length} story reference occurrence(s).`,
                    );
                    dryRunGraph = withAssetsGraph;
                } else {
                    const schemas = await schemasPromise;
                    Logger.warning(
                        `Scanning ${countStoryItems(sourceStories)} stories for copy references.`,
                    );
                    dryRunGraph = buildStoryReferenceDryRunGraph({
                        sourceSpace,
                        targetSpace,
                        selection,
                        destination,
                        plan,
                        sourceStories,
                        schemas,
                        copyMaps,
                        onScanProgress: logReferenceScanProgress,
                    });
                    Logger.success(
                        `Reference planning complete. Found ${dryRunGraph.assetReferences.length} asset reference occurrence(s) and ${dryRunGraph.storyReferences.length} story reference occurrence(s).`,
                    );
                }
            }

            // Translated slugs are read from the source stories and written in
            // a different shape, so they are planned like any other write: the
            // target's languages decide what can land, and both the dry run
            // and the gate state the count before anything happens.
            const plannedSourceStories = selectPlannedSourceStories(
                sourceStories,
                plan,
            );
            const targetLanguageCodes = plannedSourceStories.some(
                (story: any) => (story?.translated_slugs?.length ?? 0) > 0,
            )
                ? await getTargetLanguageCodes(targetSpace)
                : undefined;
            const translatedSlugs = summarizeCopyTranslatedSlugs({
                stories: plannedSourceStories,
                targetLanguageCodes,
            });

            const translatedSlugsWarning = buildCopyTranslatedSlugsWarning({
                summary: translatedSlugs,
                targetSpaceId: targetSpace,
            });

            if (translatedSlugsWarning) {
                Logger.warning(translatedSlugsWarning.message);
            }

            if (dryRun) {
                const { conflicts } = await findTargetConflicts(
                    plan,
                    targetSpace,
                );
                const dryRunLedgerMatches = await resolvePlanLedgerMatches({
                    plan,
                    sourceStories,
                    copyMaps,
                    targetSpace,
                });

                for (const item of plan) {
                    const ledgerMatch = dryRunLedgerMatches.get(
                        item.targetFullSlug,
                    );

                    if (ledgerMatch) {
                        item.ledger = ledgerMatch;
                    }
                }
                const { componentCompatibility, schemaDrift, willFail } =
                    await planSchemaPreflight({
                        targetSpace,
                        sourceSchemas: await sourceSchemasPromise,
                        sourceStories,
                        plannedSourceStories,
                    });

                Logger.warning("Building dry-run copy report.");
                const report = buildCopyDryRunReport({
                    sourceSpace,
                    targetSpace,
                    selection,
                    selections,
                    destination,
                    withAssets,
                    input: { ...flags },
                    plan,
                    conflicts,
                    graph: dryRunGraph,
                    componentCompatibility,
                    schemaDrift,
                    willFail,
                    translatedSlugs,
                    outputPath,
                    rootExpansion,
                });

                // The dry-run is where "everything" is checked, so it states
                // what / meant just as the PLAN block does on apply.
                formatCopySelectionsLine(
                    plannedSelections,
                    plan,
                    rootExpansion,
                ).forEach((line) => Logger.log(line));

                await logDryRunCopyPlan({ report, translatedSlugs });

                if (outputPath) {
                    Logger.warning(
                        `Writing dry-run copy report to ${outputPath}.`,
                    );
                    await writeDryRunReport(outputPath, report);
                }

                break;
            }

            const { existingTargetStoryIdByFullSlug } =
                await findTargetConflicts(plan, targetSpace);
            const gateLedgerMatches = await resolvePlanLedgerMatches({
                plan,
                sourceStories,
                copyMaps,
                targetSpace,
            });
            const sourceStoryByFullSlug = new Map(
                sourceStories
                    .map((item: any) => item?.story)
                    .filter(Boolean)
                    .map(
                        (story: any) =>
                            [String(story.full_slug ?? ""), story] as const,
                    ),
            );
            const planGate = buildCopyPlanGateSummary({
                sourceSpaceId: sourceSpace,
                targetSpaceId: targetSpace,
                plan: plan.map((item) => {
                    const sourceId = sourceStoryByFullSlug.get(
                        item.sourceFullSlug,
                    )?.id;
                    const ledgerMatch = gateLedgerMatches.get(
                        item.targetFullSlug,
                    );

                    return {
                        type: item.type,
                        sourceFullSlug: item.sourceFullSlug,
                        targetFullSlug: item.targetFullSlug,
                        // A ledger mapping only survives the gate if the story
                        // it points at is the one living at the planned target
                        // path — the same rule `getValidMappedTargetStory`
                        // applies per story once writing starts, answered here
                        // from the target check the gate already ran.
                        ledgerTargetStoryId:
                            sourceId === undefined
                                ? undefined
                                : copyMaps.storyIds.get(Number(sourceId)),
                        // A mapping that resolves by id is a resume, matched or
                        // moved: the same rule getValidMappedTargetStory applies
                        // once writing starts. Only an unmapped item, or one
                        // whose story is gone, is answered by the path check.
                        existingTargetStoryId:
                            ledgerMatch && ledgerMatch.match !== "missing"
                                ? ledgerMatch.targetId
                                : existingTargetStoryIdByFullSlug.get(
                                      item.targetFullSlug,
                                  ),
                    };
                }),
                ledger,
                graph: dryRunGraph,
                withAssets,
                translatedSlugs,
            });

            // Read before the PLAN is printed, so the drift lines sit inside the
            // block. The gate itself is unchanged: the operator decides.
            const gatePreflight = await planSchemaPreflight({
                targetSpace,
                sourceSchemas: await sourceSchemasPromise,
                sourceStories,
                plannedSourceStories,
            });

            formatCopyPlanGate(planGate).forEach((line) => Logger.log(line));

            formatCopySelectionsLine(
                plannedSelections,
                plan,
                rootExpansion,
            ).forEach((line) => Logger.log(line));
            // Printed here rather than by formatCopyPlanGate: the story-shaped
            // plan-gate types are frozen for this run.
            formatSchemaDriftLines(gatePreflight.schemaDrift).forEach((line) =>
                Logger.log(`  ${line}`),
            );

            if (gatePreflight.willFail.stories > 0) {
                Logger.log(
                    `  ${formatStoriesWillFailLine(gatePreflight.willFail)}`,
                );
            }

            if (!(await confirmCopyPlan({ yes }))) {
                break;
            }

            if (fresh) {
                const archived = await archiveCopyManifests(manifestPaths);

                Logger.warning(
                    archived.length > 0
                        ? `--fresh: moved ${archived.length} ledger file(s) aside so this run starts empty: ${archived.join(", ")}`
                        : "--fresh: no ledger files to move aside; starting empty.",
                );
            }

            let assetCopyReport: CopyAssetsApplyReport | undefined;
            const outcomes = new Map<string, CopyOutcomeRecord>();
            const failures: CopyRunFailure[] = [];
            const plannedTreeCounts = countTreeStories(rootsToCreate);
            let storySummary: CopyStoriesApplySummary = {
                storyFoldersPlanned: plannedTreeCounts.folders,
                storiesPlanned: plannedTreeCounts.stories,
                storiesCreated: 0,
                storiesMatched: 0,
                storiesCreateFailed: 0,
                storiesSkippedParentFailed: 0,
            };

            // From here on the target is being written. Whatever fails is
            // recorded and the report is still written: an uncaught throw would
            // lose the only record of what did land.
            try {
                if (withAssetsGraph) {
                    Logger.warning(
                        "Copying referenced assets before stories because --with-assets was passed.",
                    );
                    assetCopyReport = await copyAssetsAndWriteManifests({
                        sourceSpace,
                        targetSpace,
                        selection: {
                            type: "asset",
                            values: withAssetsGraph.assets.map((asset) =>
                                String(asset.sourceId),
                            ),
                        },
                        input: { ...flags },
                        graph: withAssetsGraph,
                        sourceAssets,
                        sourceAssetFolders,
                        manifestRoot,
                        output: copyOutput,
                    });
                }

                const publishedLayerRecordBySourceId = new Map<
                    string,
                    PublishedLayerRecord
                >();

                if (publication.mode === "preserve-layers") {
                    const publishedLayerContext =
                        await buildPublishedLayerContext(
                            {
                                items: sourceStories,
                                from: sourceSpace,
                            },
                            apiConfig,
                        );

                    for (const record of publishedLayerContext.records) {
                        publishedLayerRecordBySourceId.set(
                            String(record.storyId),
                            record,
                        );
                    }
                }

                // One map for both phases, so a mapping phase 1 finds moved re-bases
                // the paths phase 2 works under.
                const targetSlugBySourceSlug =
                    buildTargetSlugBySourceSlug(plan);
                const phaseOne = await createStoriesAndWriteManifests({
                    tree: rootsToCreate,
                    realParentId: destinationParentId,
                    sourceStoryById: buildSourceStoryById(sourceStories),
                    targetSlugBySourceSlug,
                    sourceSpace,
                    targetSpace,
                    manifestRoot,
                    outcomes,
                    output: copyOutput,
                });
                storySummary = phaseOne.summary;
                failures.push(...phaseOne.createFailures);

                if (phaseOne.createFailures.length > 0) {
                    Logger.error(
                        `${phaseOne.createFailures.length} target story/stories could not be created and ${storySummary.storiesSkippedParentFailed} item(s) under them were skipped. The run carries on with everything else and exits 1.`,
                    );
                }

                const phaseTwo = await rewriteCopiedStoryContents({
                    tree: rootsToCreate,
                    realParentId: destinationParentId,
                    sourceStoryById: buildSourceStoryById(sourceStories),
                    targetSlugBySourceSlug,
                    skippedSourceIds: phaseOne.skippedSourceIds,
                    publication,
                    publishedLayerRecordBySourceId,
                    sourceSpace,
                    targetSpace,
                    manifestRoot,
                    targetLanguageCodes,
                    outcomes,
                    output: copyOutput,
                });

                failures.push(...phaseTwo.failures);
            } catch (error) {
                const message = describeThrown(error);

                Logger.error(
                    `copy stories stopped on an unexpected error after writing started: ${message}. Everything recorded up to that point is in the report.`,
                );
                failures.push({
                    resource: "run",
                    phase: "unexpected",
                    message,
                });
            }

            const allFailures = [
                ...(assetCopyReport?.failures ?? []),
                ...failures,
            ];
            const report = buildCopyStoriesApplyReport({
                sourceSpace,
                targetSpace,
                selection,
                selections,
                destination,
                withAssets,
                input: { ...flags },
                plan,
                storySummary,
                graph: withAssetsGraph,
                assetCopyReport,
                translatedSlugs,
                manifestRoot,
                failures: allFailures,
                outcomes,
                rootExpansion,
            });

            if (outputPath) {
                await writeJsonReport(outputPath, report);
            }

            const outcomeLine = `Outcomes: ${formatCopyOutcomeCounts(report.summary.outcomes)}.`;

            if (allFailures.length > 0) {
                Logger.error(
                    `copy stories finished with ${allFailures.length} failed write(s); every other item went through. ${outcomeLine}`,
                );
                process.exitCode = 1;
            } else {
                Logger.success(`copy stories finished. ${outcomeLine}`);
            }

            break;
        }
        case COPY_COMMANDS.relink: {
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
            const selections = resolveCopySelections(flags);
            const selection = toReportedSelection(selections);
            const dryRun = Boolean(flags["dryRun"]);
            const manifestRoot = readStringFlag(flags, ["manifestRoot"]);
            const yes = Boolean(flags["yes"]);
            const destination = readStringFlag(flags, ["destination", "where"]);

            Logger.warning(
                `Relinking stories in space '${targetSpace}' against their sources in space '${sourceSpace}'.`,
            );

            // '/' is turned into the roots it stands for before anything is
            // read in full, so the run can say what "everything" meant.
            const { selections: plannedSelections, expansion: rootExpansion } =
                await expandWholeSpaceSelections(
                    selections,
                    resolveRootExcludes(flags, selections),
                    sourceSpace,
                );

            Logger.log(
                formatCopySourcesLine({
                    selections,
                    selection,
                    destination,
                    sourceSpace,
                    expansion: rootExpansion,
                }),
            );

            const { sourceStories, roots: relinkRoots } =
                await collectSelectionForest(plannedSelections, sourceSpace);
            const rootsToRelink = prepareTreeForCreate(relinkRoots);

            if (rootsToRelink.length === 0) {
                Logger.warning("No stories matched the relink selection.");
                break;
            }

            const plan = buildCopyPlan(rootsToRelink, destination);
            const manifestPaths = getDefaultCopyManifestPaths({
                sourceSpaceId: sourceSpace,
                targetSpaceId: targetSpace,
                rootDir: manifestRoot,
            });
            const manifestEntries = await loadManifest(manifestPaths.combined);
            const ledgerPath = path.resolve(manifestPaths.combined);
            const ledgerMaps = buildCopyMaps(manifestEntries);

            Logger.warning(
                manifestEntries.length > 0
                    ? `Ledger: ${manifestEntries.length} entr${manifestEntries.length === 1 ? "y" : "ies"} loaded from ${ledgerPath}.`
                    : `Ledger: none at ${ledgerPath}; the mapping is rebuilt from the target space by matching target paths.`,
            );

            const matches = await matchRelinkTargets({
                plan,
                sourceStories,
                copyMaps: ledgerMaps,
                targetSpace,
            });

            // Every mapping must be complete BEFORE a single story is
            // rewritten: a reference resolved against a half-built map is
            // exactly the silent breakage this command exists to repair.
            //
            // It must also contain nothing but mappings this run VERIFIED.
            // The ledger is a record of what was true when it was written, and
            // relinking through a mapping whose target has since been deleted
            // would replace a broken reference with a dangling one.
            const matchedStoryMappings: CopyRelinkStoryMapping[] = matches
                .filter(
                    (match) =>
                        match.sourceStory?.uuid && match.targetStory?.uuid,
                )
                .map((match) => ({
                    sourceId: Number(match.sourceStory.id),
                    sourceUuid: String(match.sourceStory.uuid),
                    targetId: Number(match.targetStory.id),
                    targetUuid: String(match.targetStory.uuid),
                    sourceFullSlug: String(
                        match.sourceStory.full_slug ??
                            match.item.sourceFullSlug,
                    ),
                    targetFullSlug: String(
                        match.targetStory.full_slug ??
                            match.item.targetFullSlug,
                    ),
                }));
            // Stories outside the selection are still repairable — relinking
            // `pages` alone must fix its links into `shared` — but only once
            // their mapping is checked against the target the same way.
            const ledgerStoryMappings = await validateRelinkLedgerMappings({
                mappings: selectRelinkLedgerStoryMappings({
                    entries: manifestEntries,
                    plannedSourceIds: new Set(
                        matches
                            .map((match) => Number(match.sourceStory?.id))
                            .filter((sourceId) => Number.isFinite(sourceId)),
                    ),
                    targetContents: matches.map(
                        (match) => match.targetStory?.content,
                    ),
                }),
                targetSpace,
            });
            const validatedStoryMappings = [
                ...matchedStoryMappings,
                ...ledgerStoryMappings.valid,
            ];
            // Files get the same treatment: the ledger says which asset was
            // copied, only the target space can say it is still there.
            const ledgerAssetMappings = await validateRelinkAssetMappings({
                mappings: selectRelinkLedgerAssetMappings({
                    entries: manifestEntries,
                    targetContents: matches.map(
                        (match) => match.targetStory?.content,
                    ),
                }),
                targetSpace,
            });
            const copyMaps = buildCopyRelinkMaps({
                storyMappings: validatedStoryMappings,
                assetMappings: ledgerAssetMappings.valid,
            });
            // The PLAN counts read against the ledger as corrected by this run:
            // out-of-selection mappings still count as covered, but everything
            // proven stale is gone, so the counts cannot promise what the
            // rewrite above will refuse to do.
            const classificationMaps = buildCopyRelinkClassificationMaps({
                ledgerMaps,
                storyMappings: validatedStoryMappings,
                staleStoryKeys: [
                    ...matches
                        .filter(
                            (match) =>
                                match.match === "missing" &&
                                match.sourceStory?.uuid,
                        )
                        .map((match) => ({
                            sourceId: Number(match.sourceStory.id),
                            sourceUuid: String(match.sourceStory.uuid),
                        })),
                    ...ledgerStoryMappings.stale,
                ],
            });

            const schemas = await buildComponentSchemaRegistry(sourceSpace);
            const relinkPlan: CopyRelinkPlanItem[] = matches.map((match) => {
                const rewrite =
                    match.targetStory && match.item.type === "story"
                        ? planCopyRelinkStoryRewrite({
                              content: match.targetStory.content,
                              maps: copyMaps,
                              schemas,
                          })
                        : undefined;

                match.rewrite = rewrite;

                return {
                    type: match.item.type,
                    sourceFullSlug: match.item.sourceFullSlug,
                    targetFullSlug: match.item.targetFullSlug,
                    match: match.match,
                    rewrittenReferences: rewrite?.rewrittenReferences ?? 0,
                    changed: rewrite?.changed ?? false,
                };
            });
            const graph = buildStoryReferenceDryRunGraph({
                sourceSpace,
                targetSpace,
                selection,
                destination,
                plan,
                sourceStories,
                schemas,
                copyMaps: classificationMaps,
                // Relink never creates a story, so a reference into one that is
                // missing from the target breaks; it cannot relink.
                unmappedSourceFullSlugs: new Set(
                    matches
                        .filter((match) => match.match === "missing")
                        .map((match) => match.item.sourceFullSlug),
                ),
                onScanProgress: logReferenceScanProgress,
            });
            const referenceCounts = countStoryReferenceStatuses(
                graph.storyReferences,
            );
            const relinkSummary = buildCopyRelinkPlanSummary({
                sourceSpaceId: sourceSpace,
                targetSpaceId: targetSpace,
                plan: relinkPlan,
                ledger: {
                    path: ledgerPath,
                    entries: manifestEntries.length,
                    ignored: false,
                },
                references: {
                    scanned: true,
                    total: graph.storyReferences.length,
                    willRelink: referenceCounts.willRelink,
                    willBreak: referenceCounts.willBreak,
                    externalKept: referenceCounts.externalKept,
                    breaking: groupBrokenStoryReferences(graph.storyReferences),
                },
            });

            formatCopyRelinkPlan(relinkSummary).forEach((line) =>
                Logger.log(line),
            );

            formatCopySelectionsLine(
                plannedSelections,
                plan,
                rootExpansion,
            ).forEach((line) => Logger.log(line));

            const outputPath = readStringFlag(flags, ["outputPath"]);
            // One report shape for both modes: the plan on --dry-run; on apply
            // the same items, each with what happened to it, plus every failure.
            const buildRelinkReport = (
                applied?: Awaited<ReturnType<typeof relinkTargetStories>>,
            ) => {
                const items = relinkPlan.map((item) => {
                    const record = applied?.outcomes.get(item.targetFullSlug);

                    return record
                        ? {
                              ...item,
                              outcome: record.outcome,
                              ...(record.targetId !== undefined
                                  ? { targetId: record.targetId }
                                  : {}),
                          }
                        : item;
                });

                return {
                    schemaVersion: 1,
                    command: "copy relink",
                    dryRun: !applied,
                    generatedAt: new Date().toISOString(),
                    input: { ...flags },
                    normalized: {
                        sourceSpaceId: sourceSpace,
                        targetSpaceId: targetSpace,
                        source: selection.source,
                        destination:
                            normalizeDestination(destination) || "root",
                        mode: selection.mode,
                        ...(selections.length > 1 ? { selections } : {}),
                        ...buildRootExpansionReport(rootExpansion),
                    },
                    summary: applied
                        ? {
                              updatedStories: applied.updatedStories,
                              unchangedStories: applied.unchangedStories,
                              rewrittenReferences: applied.rewrittenReferences,
                              outcomes: countCopyOutcomes(
                                  items.map((item) =>
                                      "outcome" in item
                                          ? item.outcome
                                          : undefined,
                                  ),
                              ),
                              failed: applied.failures.length,
                          }
                        : {},
                    plan: relinkSummary,
                    items,
                    failures: applied?.failures ?? [],
                };
            };

            if (dryRun) {
                Logger.warning(
                    "[dry-run] Relink preview only. No Storyblok writes and no ledger entries were made.",
                );

                if (outputPath) {
                    await writeDryRunReport(outputPath, buildRelinkReport());
                }

                break;
            }

            if (!(await confirmCopyPlan({ yes }))) {
                break;
            }

            const relinked = await relinkTargetStories({
                matches,
                manifestPaths,
                sourceSpace,
                targetSpace,
                output: resolveCopyOutput(flags),
            });
            const relinkReport = buildRelinkReport(relinked);

            if (outputPath) {
                await writeJsonReport(outputPath, relinkReport);
            }

            if (relinked.failures.length > 0) {
                Logger.error(
                    `copy relink finished with ${relinked.failures.length} failed write(s); every other story went through. Outcomes: ${formatCopyOutcomeCounts(relinkReport.summary.outcomes ?? countCopyOutcomes([]))}.`,
                );
                process.exitCode = 1;
            }

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
            const selection = resolveCopyAssetsSelection(flags);

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
            let graph: ReturnType<typeof buildCopyAssetsGraph>;
            let scopedSource: { assets: any[]; assetFolders: any[] };

            if (selection.type === "referenced_by_stories") {
                const storySelection = selection.storySelection;
                const [schemas, sourceStories] = await Promise.all([
                    buildComponentSchemaRegistry(sourceSpace),
                    getStoriesForSelection(storySelection, sourceSpace),
                ]);
                const normalizedStories = normalizeStoriesForTree(
                    sourceStories,
                    storySelection,
                );
                const tree = createTree(normalizedStories);
                const rootsToCreate = prepareTreeForCreate(
                    selectTreeRoots(tree, storySelection),
                );
                const plan = buildCopyPlan(rootsToCreate, undefined);
                const manifestPaths = getDefaultCopyManifestPaths({
                    sourceSpaceId: sourceSpace,
                    targetSpaceId: targetSpace,
                    rootDir: manifestRoot,
                });
                const manifestEntries = await loadManifest(
                    manifestPaths.combined,
                );
                const copyMaps = buildCopyMaps(manifestEntries);

                Logger.warning(
                    `Planning referenced assets from ${countStoryItems(sourceStories)} stories against ${sourceAssets.length} source asset(s).`,
                );
                graph = buildReferencedAssetsGraph({
                    sourceSpace,
                    targetSpace,
                    selection: storySelection,
                    destination: undefined,
                    plan,
                    sourceStories,
                    sourceAssets,
                    sourceAssetFolders,
                    schemas,
                    copyMaps,
                    // An asset-only run never rewrites stories, so story
                    // references stay `unclassified` and never warn.
                    classifyStories: false,
                    onScanProgress: logReferenceScanProgress,
                });
                Logger.success(
                    `Reference planning complete. Found ${graph.assets.length} referenced asset(s), ${graph.assetFolders.length} asset folder(s), ${graph.assetReferences.length} asset reference occurrence(s), and ${graph.storyReferences.length} story reference occurrence(s).`,
                );
                graph.scope = {
                    command: "copy assets",
                    source: storySelection.source,
                    mode: storySelection.mode,
                    referencePolicy: "preserve",
                };
                scopedSource = selectSourceAssetsFromGraph({
                    graph,
                    sourceAssets,
                    sourceAssetFolders,
                });
            } else {
                scopedSource = selectSourceAssetsForCopy({
                    selection,
                    sourceAssets,
                    sourceAssetFolders,
                });
                graph = buildCopyAssetsGraph({
                    sourceSpaceId: sourceSpace,
                    targetSpaceId: targetSpace,
                    assets: scopedSource.assets,
                    assetFolders: scopedSource.assetFolders,
                });
            }

            if (dryRun) {
                const report = buildCopyAssetsDryRunReport({
                    sourceSpace,
                    targetSpace,
                    selection,
                    input: { ...flags },
                    outputPath,
                    graph,
                    internalTags: await readInternalTagPlan({
                        sourceSpace,
                        targetSpace,
                        assets: scopedSource.assets,
                        ledgerTagIds: buildCopyMaps(
                            await loadManifest(
                                getDefaultCopyManifestPaths({
                                    sourceSpaceId: sourceSpace,
                                    targetSpaceId: targetSpace,
                                    rootDir: manifestRoot,
                                }).combined,
                            ),
                        ).internalTagIds,
                    }),
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
                selection,
                input: { ...flags },
                graph,
                sourceAssets: scopedSource.assets,
                sourceAssetFolders: scopedSource.assetFolders,
                outputPath,
                manifestRoot,
                output: resolveCopyOutput(flags),
            });

            break;
        }
        case COPY_COMMANDS.manifests: {
            const outputPath = readStringFlag(flags, ["outputPath"]);
            const manifestRoot = readStringFlag(flags, ["manifestRoot"]);
            const rawPrune = readStringFlag(flags, ["prune"]);
            const dryRun = Boolean(flags["dryRun"]);
            const yes = Boolean(flags["yes"]);
            const slug = readStringFlag(flags, ["slug"]);
            const { types, error: typeError } = parseCopyManifestTypes(flags);

            if (typeError) {
                Logger.error(typeError);
                process.exitCode = 1;
                break;
            }

            // --prune names its own pair, because it deletes that pair and
            // nothing else. Taking the target of a delete from a second flag is
            // how the wrong directory gets removed.
            if (rawPrune !== undefined) {
                if (readStringFlag(flags, ["pair", "from", "to"])) {
                    Logger.error(
                        "--prune already names the pair it deletes. Drop --pair/--from/--to so there is only one answer to which directory is being removed.",
                    );
                    process.exitCode = 1;
                    break;
                }

                if (types || slug) {
                    Logger.error(
                        "--prune deletes a pair's whole ledger directory. It cannot be narrowed by --type or --slug.",
                    );
                    process.exitCode = 1;
                    break;
                }

                const parsed = parseCopyManifestPairValue(rawPrune, "--prune");

                if (parsed.error) {
                    Logger.error(parsed.error);
                    process.exitCode = 1;
                    break;
                }

                const { sourceSpaceId, targetSpaceId } = parsed.pair!;
                let pairDir: string;
                let pairExists: boolean;

                try {
                    // Proven against the filesystem, not just the string, and
                    // before anything is read — let alone deleted.
                    ({ pairDir, exists: pairExists } =
                        await assertCopyManifestPairPathIsSafe({
                            sourceSpaceId,
                            targetSpaceId,
                            rootDir: manifestRoot,
                        }));
                } catch (error: any) {
                    if (error instanceof CopyManifestPathError) {
                        Logger.error(error.message);
                        process.exitCode = 1;
                        break;
                    }

                    throw error;
                }

                // A report written inside the directory about to be deleted is
                // a report that does not survive the command that wrote it.
                // A link is refused outright rather than followed. A dangling
                // one names a file that does not exist yet, so there is nothing
                // to resolve and the ascent lands on the link's own directory —
                // which is how a report aimed into the pair got through. And
                // where any link points can change between the check and the
                // write. A report is a plain path or it is not written.
                if (outputPath && (await isSymbolicLinkPath(outputPath))) {
                    Logger.error(
                        `--outputPath '${outputPath}' is a symbolic link. Where it points cannot be proven before the write — a dangling link names a file that does not exist yet — and --prune deletes a directory a link could aim into. Pass a plain path.`,
                    );
                    process.exitCode = 1;
                    break;
                }

                if (
                    outputPath &&
                    (await isReallyInsideDirectory(outputPath, pairDir))
                ) {
                    Logger.error(
                        `--outputPath '${outputPath}' is inside the directory --prune deletes ('${pairDir}'). The report would be destroyed by the delete it describes. Write it somewhere else.`,
                    );
                    process.exitCode = 1;
                    break;
                }

                const removalPlan = buildCopyManifestRemovalPlan({
                    sourceSpaceId,
                    targetSpaceId,
                    path: pairDir,
                    ...(pairExists
                        ? await readCopyManifestRemovalEntries(pairDir)
                        : { exists: false, entries: [] }),
                });

                formatCopyManifestRemovalPlan(removalPlan).forEach((line) =>
                    Logger.log(line),
                );

                if (outputPath) {
                    await writeJsonReport(outputPath, removalPlan);
                }

                if (!removalPlan.exists || dryRun) {
                    break;
                }

                if (!(await confirmCopyPlan({ yes }))) {
                    break;
                }

                await fs.rm(pairDir, { recursive: true, force: true });
                Logger.success(`Deleted ${pairDir}`);

                break;
            }

            const { pair, error: pairError } = resolveCopyManifestPair(flags);

            if (pairError) {
                Logger.error(pairError);
                process.exitCode = 1;
                break;
            }

            if (!pair) {
                if (types || slug) {
                    Logger.error(
                        "--type and --slug both act on one ledger. Name it with --pair <sourceSpaceId>:<targetSpaceId>.",
                    );
                    process.exitCode = 1;
                    break;
                }

                // No pair named: say what ledgers exist, and nothing about
                // whether they are healthy — that answer belongs to a pair.
                const discovered =
                    await discoverCopyManifestPairs(manifestRoot);
                const pairs: CopyManifestPairInput[] = [];

                for (const found of discovered) {
                    const paths = getDefaultCopyManifestPaths({
                        sourceSpaceId: found.sourceSpaceId,
                        targetSpaceId: found.targetSpaceId,
                        rootDir: manifestRoot,
                    });

                    pairs.push({
                        ...found,
                        rootDir: paths.rootDir,
                        path: path.resolve(paths.rootDir),
                        ...(await readCopyManifestMtime(paths.combined)),
                        files: await readCopyManifestFiles(paths),
                    });
                }

                const list = buildCopyManifestPairList({
                    root: path.resolve(getCopyManifestRoot(manifestRoot)),
                    pairs,
                });

                formatCopyManifestPairList(list).forEach((line) =>
                    Logger.log(line),
                );

                if (outputPath) {
                    await writeJsonReport(outputPath, list);
                }

                break;
            }

            let pairRootDir: string;

            try {
                // The same proof --prune makes. Reading through a symlinked
                // component is not destructive, but it reports another
                // directory's ledger as this pair's, which is its own lie.
                ({ pairDir: pairRootDir } =
                    await assertCopyManifestPairPathIsSafe({
                        sourceSpaceId: pair.sourceSpaceId,
                        targetSpaceId: pair.targetSpaceId,
                        rootDir: manifestRoot,
                    }));
            } catch (error: any) {
                if (error instanceof CopyManifestPathError) {
                    Logger.error(error.message);
                    process.exitCode = 1;
                    break;
                }

                throw error;
            }

            const manifestPaths = getDefaultCopyManifestPaths({
                sourceSpaceId: pair.sourceSpaceId,
                targetSpaceId: pair.targetSpaceId,
                rootDir: manifestRoot,
            });

            Logger.warning(
                `Reading the copy ledger for space '${pair.sourceSpaceId}' to space '${pair.targetSpaceId}'.`,
            );

            // Read-only: no Storyblok request is ever made and no ledger file
            // is written, so this is safe to run against a pair mid-copy.
            const files = await readCopyManifestFiles(manifestPaths);

            const filters: CopyManifestViewFilters = {
                ...(types ? { types } : {}),
                ...(slug ? { slug } : {}),
            };

            const inspection = inspectCopyManifests({
                sourceSpaceId: pair.sourceSpaceId,
                targetSpaceId: pair.targetSpaceId,
                rootDir: pairRootDir,
                files,
                filters,
            });

            formatCopyManifestInspection(inspection).forEach((line) =>
                Logger.log(line),
            );

            if (outputPath) {
                await writeJsonReport(outputPath, inspection);
            }

            // A ledger a run would obey wrongly is a failure, not a remark:
            // this is the one thing CI can gate a copy pipeline on.
            if (inspection.summary.errors > 0) {
                process.exitCode = 1;
            }

            break;
        }
        case COPY_COMMANDS.space: {
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
            const yes = Boolean(flags["yes"]);
            const outputPath = readStringFlag(flags, ["outputPath"]);
            const allowMissingPlugins = Boolean(
                flags["allowMissingPlugins"] ?? flags["allow-missing-plugins"],
            );
            const only = parseCopySpaceOnly(
                readStringListFlag(flags, ["only"]),
            );

            if (only.error) {
                Logger.error(only.error);
                process.exitCode = 1;
                break;
            }

            // Copying a space's schema onto itself would PUT every component
            // back over itself at best; it is never what was meant.
            if (String(sourceSpace) === String(targetSpace)) {
                Logger.error(
                    `--from and --to both resolve to space ${sourceSpace}. copy space needs two different spaces.`,
                );
                process.exitCode = 1;
                break;
            }

            Logger.warning(
                `Copying the schema of space '${sourceSpace}' into space '${targetSpace}'.`,
            );

            const result = await runCopySpace({
                sbApi: apiConfig.sbApi as any,
                sourceSpaceId: String(sourceSpace),
                targetSpaceId: String(targetSpace),
                resources: only.resources,
                dryRun,
                concurrency: resolveCopySpaceConcurrency(apiConfig.rateLimit),
                allowMissingPlugins,
                showPlan: async (plan) => {
                    formatCopySpacePlanGate(
                        buildCopySpacePlanGateSummary(plan),
                    ).forEach((line) => Logger.log(line));

                    if (outputPath) {
                        await writeJsonReport(outputPath, plan);
                    }
                },
                confirm: () => confirmCopyPlan({ yes }),
            });

            if (result.refused === "missing_field_type_plugins") {
                const missing = result.plan.fieldTypePlugins?.missing ?? [];

                Logger.error(
                    `copy space refused to write: space ${targetSpace} does not have ${missing.length} field-type ${missing.length === 1 ? "plugin" : "plugins"} the source components use (${missing.map((plugin) => plugin.name).join(", ")}). Assign ${missing.length === 1 ? "it" : "them"} to space ${targetSpace} in Storyblok, or pass --allow-missing-plugins to write anyway. Nothing was written.`,
                );
                process.exitCode = 1;
                break;
            }

            if (!result.applied) {
                if (dryRun) {
                    Logger.log("Dry run: nothing was written.");
                }

                break;
            }

            const missingPluginGroups = groupMissingPluginFailures(
                result.failures,
            );

            if (outputPath) {
                await writeJsonReport(outputPath, {
                    ...result.plan,
                    applied: {
                        failures: result.failures,
                        ...(missingPluginGroups.components > 0
                            ? { missingFieldTypePlugins: missingPluginGroups }
                            : {}),
                    },
                });
            }

            if (result.failures.length > 0) {
                // One summary line for every component rejected for a missing
                // plugin; each of them stays in the report's failures.
                if (missingPluginGroups.components > 0) {
                    Logger.error(
                        formatMissingPluginFailures(missingPluginGroups),
                    );
                }

                Logger.error(
                    `copy space finished with ${result.failures.length} failed ${result.failures.length === 1 ? "write" : "writes"}; every other write went through.`,
                );
                process.exitCode = 1;
                break;
            }

            Logger.success(
                `copy space finished: the schema of space ${sourceSpace} is in space ${targetSpace}.`,
            );

            break;
        }
        default:
            Logger.warning(
                "Unsupported copy command. Use: sb-mig copy stories --from <sourceSpaceId> --to <targetSpaceId> --source <full_slug> --destination <target_folder>, sb-mig copy assets --from <sourceSpaceId> --to <targetSpaceId> --all --dry-run, or sb-mig copy manifests to list the copy ledgers on disk.",
            );
    }
};
