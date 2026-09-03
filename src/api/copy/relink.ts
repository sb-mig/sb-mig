import type { CopyComponentSchemaRegistry, CopyMaps } from "./types.js";

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

    lines.push(formatCopyPlanGateLedger(ledger));
    lines.push(
        ...formatCopyPlanGateReferences({
            references,
            sameSpace: summary.sameSpace,
        }),
    );
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
