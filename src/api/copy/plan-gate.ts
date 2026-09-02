import type { CopyGraph, CopyMaps } from "./types.js";

import { countStoryReferenceStatuses } from "./reference-classifier.js";

/**
 * Everything a `copy stories` apply run knows before its first write, in one
 * place. Built from the plan, the target conflict check, the loaded ledger and
 * the reference scan so the PLAN block can be rendered and tested without any
 * API access.
 */
export type CopyPlanGatePlanItem = {
    type: "folder" | "story";
    sourceId?: number;
    sourceFullSlug: string;
    targetFullSlug: string;
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
        /** No ledger mapping and no existing target path: a new shell. */
        create: number;
        /** Ledger already maps the source story: the mapped target is reused. */
        resume: number;
        /**
         * No ledger mapping but the target path already exists: the run adopts
         * it (`matched_by_target_key`) and UPDATES it in place.
         */
        adopt: number;
    };
    ledger: CopyPlanGateLedger;
    references: {
        scanned: boolean;
        total: number;
        willRelink: number;
        willBreak: number;
        externalKept: number;
    };
    assets?: {
        toCopy: number;
        mapped: number;
    };
};

export const buildCopyPlanGateSummary = ({
    sourceSpaceId,
    targetSpaceId,
    plan,
    conflictTargetFullSlugs,
    copyMaps,
    ledger,
    graph,
    withAssets,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    plan: CopyPlanGatePlanItem[];
    conflictTargetFullSlugs: Iterable<string>;
    copyMaps: CopyMaps;
    ledger: CopyPlanGateLedger;
    graph?: CopyGraph;
    withAssets: boolean;
}): CopyPlanGateSummary => {
    const conflicts = new Set(conflictTargetFullSlugs);
    let create = 0;
    let resume = 0;
    let adopt = 0;

    for (const item of plan) {
        if (
            item.sourceId !== undefined &&
            copyMaps.storyIds.has(item.sourceId)
        ) {
            resume += 1;
        } else if (conflicts.has(item.targetFullSlug)) {
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
        },
        ledger,
        references: {
            scanned: graph !== undefined,
            total: graph?.storyReferences.length ?? 0,
            willRelink: referenceCounts.willRelink,
            willBreak: referenceCounts.willBreak,
            externalKept: referenceCounts.externalKept,
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
