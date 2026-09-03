import type { CopyGraph } from "./types.js";

import {
    countStoryReferenceStatuses,
    describeBrokenStoryReferenceTarget,
    groupBrokenStoryReferences,
    type CopyBrokenStoryReferenceGroup,
} from "./reference-classifier.js";

/**
 * Everything a `copy stories` apply run knows before its first write, in one
 * place. Built from the plan, the target conflict check, the loaded ledger and
 * the reference scan so the PLAN block can be rendered and tested without any
 * API access.
 */
export type CopyPlanGatePlanItem = {
    type: "folder" | "story";
    sourceFullSlug: string;
    targetFullSlug: string;
    /**
     * Target story id the ledger maps this source story to, if any. A mapping
     * only counts as a resume when the mapped story is the one actually living
     * at `targetFullSlug` — see `existingTargetStoryId`.
     */
    ledgerTargetStoryId?: number;
    /** Id of the story that already occupies `targetFullSlug` in the target. */
    existingTargetStoryId?: number;
};

export type CopyPlanGateLedger = {
    /** Absolute path of the combined manifest the run reads back. */
    path: string;
    /** Entries found on disk, whether or not they are used. */
    entries: number;
    /** `--fresh`: the entries above are ignored and the run starts empty. */
    ignored: boolean;
};

export type CopyPlanGateSummary = {
    sourceSpaceId: string;
    targetSpaceId: string;
    sameSpace: boolean;
    stories: {
        total: number;
        folders: number;
        /** No usable ledger mapping and no existing target path: a new shell. */
        create: number;
        /** The ledger maps the source story to the story at the target path. */
        resume: number;
        /**
         * No usable ledger mapping but the target path already exists: the run
         * adopts it (`matched_by_target_key`) and UPDATES it in place.
         */
        adopt: number;
        /**
         * Ledger mappings that no longer resolve in the target space (the
         * mapped story was deleted, moved or replaced). They are counted as
         * create/adopt above, exactly as the run will treat them.
         */
        staleLedger: number;
    };
    ledger: CopyPlanGateLedger;
    references: {
        scanned: boolean;
        total: number;
        willRelink: number;
        willBreak: number;
        externalKept: number;
        /** The will-break references grouped by the story that holds them. */
        breaking: CopyBrokenStoryReferenceGroup[];
    };
    assets?: {
        toCopy: number;
        mapped: number;
    };
};

/** How many holding stories the PLAN block names before it summarises the rest. */
const MAX_LISTED_BREAK_GROUPS = 20;

export const buildCopyPlanGateSummary = ({
    sourceSpaceId,
    targetSpaceId,
    plan,
    ledger,
    graph,
    withAssets,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    plan: CopyPlanGatePlanItem[];
    ledger: CopyPlanGateLedger;
    graph?: CopyGraph;
    withAssets: boolean;
}): CopyPlanGateSummary => {
    let create = 0;
    let resume = 0;
    let adopt = 0;
    let staleLedger = 0;

    for (const item of plan) {
        if (item.ledgerTargetStoryId !== undefined) {
            if (item.ledgerTargetStoryId === item.existingTargetStoryId) {
                resume += 1;
                continue;
            }

            // The mapping is on disk but the target no longer backs it, so the
            // run will discard it and fall through to adoption or creation.
            staleLedger += 1;
        }

        if (item.existingTargetStoryId !== undefined) {
            adopt += 1;
        } else {
            create += 1;
        }
    }

    const referenceCounts = countStoryReferenceStatuses(
        graph?.storyReferences ?? [],
    );

    return {
        sourceSpaceId,
        targetSpaceId,
        sameSpace: sourceSpaceId === targetSpaceId,
        stories: {
            total: plan.length,
            folders: plan.filter((item) => item.type === "folder").length,
            create,
            resume,
            adopt,
            staleLedger,
        },
        ledger,
        references: {
            scanned: graph !== undefined,
            total: graph?.storyReferences.length ?? 0,
            willRelink: referenceCounts.willRelink,
            willBreak: referenceCounts.willBreak,
            externalKept: referenceCounts.externalKept,
            breaking: groupBrokenStoryReferences(graph?.storyReferences ?? []),
        },
        ...(withAssets && graph
            ? {
                  assets: {
                      toCopy: graph.assets.filter(
                          (asset) => asset.action === "create",
                      ).length,
                      mapped: graph.assets.filter(
                          (asset) => asset.action === "match",
                      ).length,
                  },
              }
            : {}),
    };
};

const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;

/**
 * Renders the PLAN block printed before the confirmation gate. Every line is
 * a fact the run already knows; nothing here is a promise about the future
 * beyond what the classifier and the target check established.
 */
export const formatCopyPlanGate = (summary: CopyPlanGateSummary): string[] => {
    const { stories, ledger, references, assets } = summary;
    const storyParts = [
        `${stories.create} create`,
        `${stories.adopt} adopt existing`,
        `${stories.resume} resume from ledger`,
    ];
    const lines = [
        "PLAN",
        `  ${stories.total} ${plural(stories.total, "item", "items")} (${stories.folders} ${plural(stories.folders, "folder", "folders")}) -> space ${summary.targetSpaceId} (${storyParts.join(", ")})`,
    ];

    if (stories.adopt > 0) {
        lines.push(
            `    ${stories.adopt} existing target ${plural(stories.adopt, "path", "paths")} will be adopted and UPDATED in place.`,
        );
    }

    if (stories.staleLedger > 0) {
        lines.push(
            `    ${stories.staleLedger} ledger ${plural(stories.staleLedger, "mapping", "mappings")} no longer ${plural(stories.staleLedger, "resolves", "resolve")} in space ${summary.targetSpaceId} and will be discarded.`,
        );
    }

    if (ledger.ignored) {
        lines.push(
            `  ledger: ${ledger.entries} ${plural(ledger.entries, "entry", "entries")} at ${ledger.path} IGNORED (--fresh; starting empty)`,
        );
    } else if (ledger.entries > 0) {
        lines.push(
            `  ledger: ${ledger.entries} ${plural(ledger.entries, "entry", "entries")} loaded from ${ledger.path} (resuming; use --fresh to ignore)`,
        );
    } else {
        lines.push(`  ledger: none at ${ledger.path} (starting empty)`);
    }

    if (!references.scanned) {
        lines.push("  references: not scanned");
    } else {
        const referenceParts = [`${references.willRelink} will relink`];

        if (summary.sameSpace) {
            referenceParts.push(
                `${references.externalKept} outside the selection kept (same space)`,
            );
        }

        referenceParts.push(
            references.willBreak > 0
                ? `${references.willBreak} leave your selection and WILL BREAK`
                : "0 will break",
        );
        lines.push(`  references: ${referenceParts.join(", ")}`);
        lines.push(...formatBreakingReferences(references.breaking));
    }

    if (assets) {
        lines.push(
            `  assets: ${assets.toCopy} will copy, ${assets.mapped} already mapped`,
        );
    } else {
        lines.push("  assets: not copied (pass --with-assets)");
    }

    return lines;
};

/**
 * The same grouped detail the dry-run prints: a count alone does not tell the
 * operator which stories are about to lose which fields, and the gate is the
 * last moment they can act on it.
 */
const formatBreakingReferences = (
    groups: CopyBrokenStoryReferenceGroup[],
): string[] => {
    if (groups.length === 0) {
        return [];
    }

    const lines = ["    WILL BREAK, by story:"];

    for (const group of groups.slice(0, MAX_LISTED_BREAK_GROUPS)) {
        lines.push(`      ${group.sourceStoryFullSlug}`);

        for (const reference of group.references) {
            lines.push(
                `        ${reference.path} -> ${describeBrokenStoryReferenceTarget(reference)}`,
            );
        }
    }

    const hidden = groups.length - MAX_LISTED_BREAK_GROUPS;

    if (hidden > 0) {
        lines.push(
            `      ...and ${hidden} more ${plural(hidden, "story", "stories")} with breaking references; run with --dryRun for the full list.`,
        );
    }

    return lines;
};
