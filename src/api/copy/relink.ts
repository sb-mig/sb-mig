import type {
    CopyComponentSchemaRegistry,
    CopyManifestEntry,
    CopyMaps,
} from "./types.js";

import { createEmptyCopyMaps } from "./manifest.js";
import {
    formatCopyPlanGateLedger,
    formatCopyPlanGateReferences,
    type CopyPlanGateLedger,
    type CopyPlanGateReferences,
} from "./plan-gate.js";
import { rewriteCopyReferences } from "./reference-rewriter.js";

/**
 * How a planned story was matched to a story that already exists in the target
 * space. `missing` stories were never copied, so there is nothing to repair.
 */
export type CopyRelinkMatch = "ledger" | "adopted" | "missing";

export type CopyRelinkPlanItem = {
    type: "folder" | "story";
    sourceFullSlug: string;
    targetFullSlug: string;
    match: CopyRelinkMatch;
    /**
     * References this run would rewrite in the story's *target* content, as
     * counted against the completed mapping. Zero for folders, for missing
     * stories and for stories whose references already resolve.
     */
    rewrittenReferences: number;
    /** Whether the rewrite actually changes the stored content. */
    changed: boolean;
};

export type CopyRelinkPlanSummary = {
    sourceSpaceId: string;
    targetSpaceId: string;
    sameSpace: boolean;
    stories: {
        total: number;
        folders: number;
        /** Matched through an existing, still valid ledger mapping. */
        fromLedger: number;
        /** Matched by target path; the run records the mapping before rewriting. */
        adopted: number;
        /** Planned but absent from the target: nothing to relink. */
        missing: number;
        /** Stories whose target content this run will update. */
        toUpdate: number;
        /**
         * Matched stories whose references already resolve; left untouched.
         * Folders are counted in neither: they hold no content.
         */
        unchanged: number;
    };
    /** References the run will rewrite across every story it updates. */
    rewrittenReferences: number;
    ledger: CopyPlanGateLedger;
    references: CopyPlanGateReferences;
};

/**
 * One source story mapped to the story that actually backs it in the target,
 * as proven by this run at the moment it built its maps.
 */
export type CopyRelinkStoryMapping = {
    sourceId: number;
    sourceUuid: string;
    targetId: number;
    targetUuid: string;
    sourceFullSlug: string;
    targetFullSlug: string;
};

const applyCopyRelinkStoryMapping = (
    maps: CopyMaps,
    mapping: CopyRelinkStoryMapping,
) => {
    maps.storyIds.set(mapping.sourceId, mapping.targetId);
    maps.storyUuids.set(mapping.sourceUuid, mapping.targetUuid);

    if (mapping.targetFullSlug) {
        maps.storyFullSlugs.set(mapping.sourceUuid, mapping.targetFullSlug);
        maps.storyFullSlugs.set(mapping.targetUuid, mapping.targetFullSlug);
    }
};

/**
 * The maps `copy relink` rewrites through. Story mappings come ONLY from
 * matches this run validated against the target space — a ledger line whose
 * target story is gone would otherwise rewrite a live reference to a deleted
 * uuid, which is worse than the break the command was asked to repair. Asset
 * mappings carry over untouched: they record copied files, and no story match
 * can invalidate them.
 */
export const buildCopyRelinkMaps = ({
    ledgerMaps,
    storyMappings,
}: {
    ledgerMaps: CopyMaps;
    storyMappings: CopyRelinkStoryMapping[];
}): CopyMaps => {
    const maps = createEmptyCopyMaps();

    ledgerMaps.assetIds.forEach((value, key) => maps.assetIds.set(key, value));
    ledgerMaps.assetFilenames.forEach((value, key) =>
        maps.assetFilenames.set(key, value),
    );
    ledgerMaps.assetFolderIds.forEach((value, key) =>
        maps.assetFolderIds.set(key, value),
    );

    for (const mapping of storyMappings) {
        applyCopyRelinkStoryMapping(maps, mapping);
    }

    return maps;
};

/**
 * The maps the PLAN's reference counts are read against. Unlike the rewrite
 * maps, these keep the ledger's own out-of-selection mappings: a reference the
 * ledger already covers is not a break just because this run never had to
 * touch it. What they must not keep is any mapping this run PROVED stale —
 * otherwise the plan promises a relink the rewrite will refuse.
 */
export const buildCopyRelinkClassificationMaps = ({
    ledgerMaps,
    storyMappings,
    staleStoryKeys,
}: {
    ledgerMaps: CopyMaps;
    storyMappings: CopyRelinkStoryMapping[];
    staleStoryKeys: Array<{ sourceId: number; sourceUuid: string }>;
}): CopyMaps => {
    const maps: CopyMaps = {
        storyIds: new Map(ledgerMaps.storyIds),
        storyUuids: new Map(ledgerMaps.storyUuids),
        storyFullSlugs: new Map(ledgerMaps.storyFullSlugs),
        assetIds: new Map(ledgerMaps.assetIds),
        assetFilenames: new Map(ledgerMaps.assetFilenames),
        assetFolderIds: new Map(ledgerMaps.assetFolderIds),
    };

    for (const key of staleStoryKeys) {
        maps.storyIds.delete(key.sourceId);
        maps.storyUuids.delete(key.sourceUuid);
        maps.storyFullSlugs.delete(key.sourceUuid);
        maps.storyFullSlugs.delete(
            ledgerMaps.storyUuids.get(key.sourceUuid) ?? key.sourceUuid,
        );
    }

    for (const mapping of storyMappings) {
        applyCopyRelinkStoryMapping(maps, mapping);
    }

    return maps;
};

const mentionsStoryValue = (
    serializedContent: string,
    value: string | number,
): boolean =>
    typeof value === "string"
        ? value.length > 0 && serializedContent.includes(value)
        : Number.isFinite(value) &&
          new RegExp(`(^|[^0-9])${value}([^0-9]|$)`).test(serializedContent);

/**
 * Both ends of the mapping count. The source uuid is the unrepaired reference;
 * the target uuid is a reference an earlier run already relinked, whose stored
 * path may still be the source's.
 */
const mentionsStoryReference = (
    serializedContent: string,
    mapping: CopyRelinkStoryMapping,
): boolean =>
    [
        mapping.sourceUuid,
        mapping.sourceId,
        mapping.targetUuid,
        mapping.targetId,
    ].some((value) => mentionsStoryValue(serializedContent, value));

/**
 * Ledger mappings for stories OUTSIDE the relink selection that the target
 * content actually mentions — the `shared/header` a relink of `pages` alone
 * still has to repair. These are candidates, not conclusions: the caller
 * validates each one against the target space before it may join the rewrite
 * maps.
 *
 * The mention test is a substring scan of the target content and deliberately
 * generous: a false positive costs one lookup, a miss would silently leave a
 * reference unrepaired.
 */
export const selectRelinkLedgerStoryMappings = ({
    entries,
    plannedSourceIds,
    targetContents,
}: {
    entries: CopyManifestEntry[];
    plannedSourceIds: Set<number>;
    targetContents: unknown[];
}): CopyRelinkStoryMapping[] => {
    const serializedContent = targetContents
        .map((content) => JSON.stringify(content ?? null))
        .join("\n");
    const mappings = new Map<number, CopyRelinkStoryMapping>();

    for (const entry of entries) {
        if (entry.type !== "story" || plannedSourceIds.has(entry.source_id)) {
            continue;
        }

        const mapping: CopyRelinkStoryMapping = {
            sourceId: Number(entry.source_id),
            sourceUuid: String(entry.source_uuid ?? ""),
            targetId: Number(entry.target_id),
            targetUuid: String(entry.target_uuid ?? ""),
            sourceFullSlug: String(entry.source_full_slug ?? ""),
            targetFullSlug: String(entry.target_full_slug ?? ""),
        };

        if (mentionsStoryReference(serializedContent, mapping)) {
            mappings.set(mapping.sourceId, mapping);
        }
    }

    return Array.from(mappings.values());
};

export const buildCopyRelinkPlanSummary = ({
    sourceSpaceId,
    targetSpaceId,
    plan,
    ledger,
    references,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    plan: CopyRelinkPlanItem[];
    ledger: CopyPlanGateLedger;
    references: CopyPlanGateReferences;
}): CopyRelinkPlanSummary => {
    // Folders carry no content, so they are neither updated nor "already
    // correct" — only stories are candidates for a rewrite.
    const rewritable = plan.filter(
        (item) => item.match !== "missing" && item.type === "story",
    );

    return {
        sourceSpaceId,
        targetSpaceId,
        sameSpace: sourceSpaceId === targetSpaceId,
        stories: {
            total: plan.length,
            folders: plan.filter((item) => item.type === "folder").length,
            fromLedger: plan.filter((item) => item.match === "ledger").length,
            adopted: plan.filter((item) => item.match === "adopted").length,
            missing: plan.filter((item) => item.match === "missing").length,
            toUpdate: rewritable.filter((item) => item.changed).length,
            unchanged: rewritable.filter((item) => !item.changed).length,
        },
        rewrittenReferences: plan.reduce(
            (total, item) =>
                total + (item.changed ? item.rewrittenReferences : 0),
            0,
        ),
        ledger,
        references,
    };
};

const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;

/**
 * The PLAN block `copy relink` prints before its first write. Unlike the copy
 * gate's counts, the rewrite figures here are not estimates: the target content
 * has already been read and rewritten in memory, so the block states exactly
 * what the run is about to store.
 */
export const formatCopyRelinkPlan = (
    summary: CopyRelinkPlanSummary,
): string[] => {
    const { stories, ledger, references } = summary;
    const matchParts = [
        `${stories.fromLedger} mapped by ledger`,
        `${stories.adopted} adopted by target path`,
        `${stories.missing} missing from target`,
    ];
    const lines = [
        "PLAN",
        `  ${stories.total} planned ${plural(stories.total, "item", "items")} (${stories.folders} ${plural(stories.folders, "folder", "folders")}) in space ${summary.targetSpaceId} (${matchParts.join(", ")})`,
    ];

    if (stories.adopted > 0) {
        lines.push(
            `    ${stories.adopted} target ${plural(stories.adopted, "story", "stories")} will be added to the ledger as matched_by_target_key.`,
        );
    }

    if (stories.missing > 0) {
        lines.push(
            `    ${stories.missing} planned ${plural(stories.missing, "story is", "stories are")} not in the target and cannot be relinked; copy ${plural(stories.missing, "it", "them")} first.`,
        );
    }

    lines.push(
        // `copy relink` has no `--fresh`: the ledger is its input, and target
        // path adoption already fills whatever the ledger is missing.
        formatCopyPlanGateLedger(ledger, {
            resumeNote: "completing the mapping from the target space",
        }),
    );

    // The scan reads the SOURCE stories this selection covers, while the
    // rewrite below is measured in the TARGET content relink actually writes.
    // The two answer different questions and their counts legitimately differ,
    // so the line says which one it is instead of implying the other.
    const referenceLines = formatCopyPlanGateReferences({
        references,
        sameSpace: summary.sameSpace,
        label: "source references",
    });

    lines.push(
        ...referenceLines.slice(0, 1),
        "    Counted in the source content this selection covers, against the mapping above; the rewrite line below is what changes in the target.",
        ...referenceLines.slice(1),
    );

    if (stories.missing > 0 && references.willBreak > 0) {
        lines.push(
            `    References into ${plural(stories.missing, "the story", "stories")} missing from the target cannot be repaired here; copy ${plural(stories.missing, "it", "them")} first, then relink again.`,
        );
    }

    lines.push(
        `  rewrite: ${summary.rewrittenReferences} ${plural(summary.rewrittenReferences, "reference", "references")} in ${stories.toUpdate} ${plural(stories.toUpdate, "story", "stories")}; ${stories.unchanged} already correct and left untouched`,
    );
    lines.push(
        "  content: only reference values change; nothing is copied from the source",
    );

    return lines;
};

export type CopyRelinkStoryRewrite = {
    content: unknown;
    rewrittenReferences: number;
    changed: boolean;
};

/**
 * The relink rewrite of one already-copied target story: the target's own
 * content with its reference values remapped.
 *
 * Whether to write is decided by comparing values, not by counting rewrite
 * records — a reference that maps to itself records a rewrite without changing
 * a byte, and a story that is already correct must be left alone.
 */
export const planCopyRelinkStoryRewrite = ({
    content,
    maps,
    schemas,
}: {
    content: unknown;
    maps: CopyMaps;
    schemas?: CopyComponentSchemaRegistry;
}): CopyRelinkStoryRewrite => {
    const original = content ?? {};
    const rewritten = rewriteCopyReferences({
        value: original,
        maps,
        schemas,
    });

    return {
        content: rewritten.value,
        rewrittenReferences: rewritten.records.length,
        changed: JSON.stringify(rewritten.value) !== JSON.stringify(original),
    };
};
