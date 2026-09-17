import type {
    CopySpaceDroppedWhitelistGroup,
    CopySpaceFieldTypePlugin,
    CopySpaceFieldTypePluginsPlan,
    CopySpacePlan,
    CopySpaceSettingsFieldPlan,
    CopySpaceSettingsPlan,
    CopySpaceSkip,
} from "./space.js";
import type { CopyTranslatedSlugSummary } from "./translated-slugs.js";
import type { CopyGraph } from "./types.js";

import {
    countStoryReferenceStatuses,
    describeBrokenStoryReferenceTarget,
    groupBrokenStoryReferences,
    type CopyBrokenStoryReferenceGroup,
} from "./reference-classifier.js";
import { describeCopyTranslatedSlugs } from "./translated-slugs.js";

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

/** The reference facts a PLAN block states, whatever command printed it. */
export type CopyPlanGateReferences = {
    scanned: boolean;
    total: number;
    willRelink: number;
    willBreak: number;
    externalKept: number;
    /** The will-break references grouped by the story that holds them. */
    breaking: CopyBrokenStoryReferenceGroup[];
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
    references: CopyPlanGateReferences;
    assets?: {
        toCopy: number;
        mapped: number;
    };
    /** Absent when the run never looked; empty counts when it found none. */
    translatedSlugs?: CopyTranslatedSlugSummary;
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
    translatedSlugs,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    plan: CopyPlanGatePlanItem[];
    ledger: CopyPlanGateLedger;
    graph?: CopyGraph;
    withAssets: boolean;
    translatedSlugs?: CopyTranslatedSlugSummary;
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
        ...(translatedSlugs ? { translatedSlugs } : {}),
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

    if (stories.folders > 0) {
        // Stated before the gate because it differs from the source: a folder
        // published there is not published here (see copy stories GOTCHAS).
        lines.push(`  folders: ${stories.folders} (never published)`);
    }

    lines.push(formatCopyPlanGateLedger(ledger));
    lines.push(
        ...formatCopyPlanGateReferences({
            references,
            sameSpace: summary.sameSpace,
        }),
    );

    if (summary.translatedSlugs) {
        const [carried, ...notes] = describeCopyTranslatedSlugs({
            summary: summary.translatedSlugs,
            targetSpaceId: summary.targetSpaceId,
        });

        if (carried) {
            lines.push(`  ${carried}`);
            lines.push(...notes.map((note) => `    ${note}`));
        }
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
 * The one line stating where the ledger came from and whether it is used.
 * `resumeNote` is what the loaded-ledger line says in brackets; a command
 * without `--fresh` must not advertise it, so it passes its own note.
 */
export const formatCopyPlanGateLedger = (
    ledger: CopyPlanGateLedger,
    {
        resumeNote = "resuming; use --fresh to ignore",
    }: {
        resumeNote?: string;
    } = {},
): string => {
    if (ledger.ignored) {
        return `  ledger: ${ledger.entries} ${plural(ledger.entries, "entry", "entries")} at ${ledger.path} IGNORED (--fresh; starting empty)`;
    }

    if (ledger.entries > 0) {
        return `  ledger: ${ledger.entries} ${plural(ledger.entries, "entry", "entries")} loaded from ${ledger.path} (${resumeNote})`;
    }

    return `  ledger: none at ${ledger.path} (starting empty)`;
};

/**
 * The reference counts and, when anything dangles, the grouped detail. The
 * `label` names what the counts were measured against: `copy stories` scans
 * the content it is about to copy, so plain `references` is the whole truth,
 * while a command that rewrites something else must say so.
 */
export const formatCopyPlanGateReferences = ({
    references,
    sameSpace,
    label = "references",
}: {
    references: CopyPlanGateReferences;
    sameSpace: boolean;
    label?: string;
}): string[] => {
    if (!references.scanned) {
        return [`  ${label}: not scanned`];
    }

    const parts = [`${references.willRelink} will relink`];

    if (sameSpace) {
        parts.push(
            `${references.externalKept} outside the selection kept (same space)`,
        );
    }

    parts.push(
        references.willBreak > 0
            ? `${references.willBreak} leave your selection and WILL BREAK`
            : "0 will break",
    );

    return [
        `  ${label}: ${parts.join(", ")}`,
        ...formatBreakingReferences(references.breaking),
    ];
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

/* ------------------------------------------------------------------ *
 * copy space
 * ------------------------------------------------------------------ */

export type CopySpacePlanGateLine = {
    resource: string;
    create: number;
    update: number;
    skip: number;
};

/**
 * The facts a `copy space` PLAN block states. Separate from the story-shaped
 * summary on purpose: a schema copy has no ledger, no references and no paths,
 * and bending that type to fit would change what every story command prints.
 */
export type CopySpacePlanGateSummary = {
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: string[];
    lines: CopySpacePlanGateLine[];
    droppedWhitelistGroups: CopySpaceDroppedWhitelistGroup[];
    skipped: CopySpaceSkip[];
    presetsWithSourceAssetUrls: number;
    componentsWithSourceImageUrls: number;
    componentsWithInternalTags: number;
    defaultPresets?: { restore: number; notRestorable: number };
    fieldTypePlugins?: CopySpaceFieldTypePluginsPlan;
    entriesStoryblokWillReject?: CopySpacePlan["entriesStoryblokWillReject"];
    /** Present when `settings` is in scope; already redacted. */
    settings?: CopySpaceSettingsPlan;
};

export const buildCopySpacePlanGateSummary = (
    plan: CopySpacePlan,
): CopySpacePlanGateSummary => {
    const lines: CopySpacePlanGateLine[] = [];
    const skipped: CopySpaceSkip[] = [];

    if (plan.languages) {
        lines.push({
            resource: "languages",
            create: plan.languages.add.length,
            update: plan.languages.update.length,
            skip: 0,
        });
    }

    for (const resource of [
        "groups",
        "components",
        "presets",
        "datasources",
        "entries",
    ] as const) {
        const resourcePlan = plan[resource];

        if (!resourcePlan) {
            continue;
        }

        lines.push({
            resource,
            create: resourcePlan.create.length,
            update: resourcePlan.update.length,
            skip: resourcePlan.skip.length,
        });
        skipped.push(
            ...resourcePlan.skip.map((skip) => ({
                name: `${resource} ${skip.name}`,
                reason: skip.reason,
            })),
        );
    }

    return {
        sourceSpaceId: plan.sourceSpaceId,
        targetSpaceId: plan.targetSpaceId,
        resources: plan.resources,
        lines,
        droppedWhitelistGroups: plan.droppedWhitelistGroups,
        skipped,
        presetsWithSourceAssetUrls: plan.presetsWithSourceAssetUrls.length,
        componentsWithSourceImageUrls:
            plan.componentsWithSourceImageUrls.length,
        componentsWithInternalTags: plan.componentsWithInternalTags,
        ...(plan.defaultPresets
            ? {
                  defaultPresets: {
                      restore: plan.defaultPresets.restore.length,
                      notRestorable: plan.defaultPresets.notRestorable.length,
                  },
              }
            : {}),
        ...(plan.fieldTypePlugins
            ? { fieldTypePlugins: plan.fieldTypePlugins }
            : {}),
        ...(plan.entriesStoryblokWillReject
            ? { entriesStoryblokWillReject: plan.entriesStoryblokWillReject }
            : {}),
        ...(plan.settings ? { settings: plan.settings } : {}),
    };
};

const describeSettingValue = (value: CopySpaceSettingsFieldPlan["source"]) =>
    value === undefined || typeof value === "object" ? "none" : String(value);

const environmentsCount = (value: CopySpaceSettingsFieldPlan["source"]) =>
    typeof value === "object" ? value.count : 0;

/**
 * The settings lines of the PLAN: one summary line, then one line per field
 * that changes or that the target keeps. Every value in the plan is already
 * redacted, and preview URLs are named, never shown.
 */
const formatCopySpaceSettings = (settings: CopySpaceSettingsPlan): string[] => {
    const lines = [
        `  settings: ${settings.change} change, ${settings.same} same, ${settings.kept} kept`,
    ];

    for (const entry of settings.fields) {
        if (entry.outcome === "same") {
            continue;
        }

        if (entry.field === "environments") {
            // Merged by name, never replaced: the count after the merge, and
            // which names are added or get a new preview URL.
            const merge = entry.merge ?? { count: 0, added: [], updated: [] };
            const parts = [
                ...(merge.added.length > 0
                    ? [`added: ${merge.added.join(", ")}`]
                    : []),
                ...(merge.updated.length > 0
                    ? [`updated: ${merge.updated.join(", ")}`]
                    : []),
            ];

            lines.push(
                `    environments: ${environmentsCount(entry.target)} -> ${merge.count}${parts.length > 0 ? ` (${parts.join("; ")})` : ""}`,
            );
            continue;
        }

        lines.push(
            entry.outcome === "change"
                ? `    ${entry.field}: ${describeSettingValue(entry.target)} -> ${describeSettingValue(entry.source)}`
                : `    ${entry.field}: kept ${describeSettingValue(entry.target)} (source ${describeSettingValue(entry.source)})`,
        );
    }

    return lines;
};

/** `seo-metatags (5 components), backpack-breakpoints (1 component)` */
const formatFieldTypePluginList = (plugins: CopySpaceFieldTypePlugin[]) =>
    plugins
        .map(
            (plugin) =>
                `${plugin.name} (${plugin.components.length} ${plural(plugin.components.length, "component", "components")})`,
        )
        .join(", ");

const formatCopySpaceFieldTypePlugins = (
    plugins: CopySpaceFieldTypePluginsPlan,
    targetSpaceId: string,
): string[] => {
    const { target } = plugins;

    if (target.readable === false) {
        return [
            `  field-type plugins the source uses: ${formatFieldTypePluginList(plugins.used)} — the target must have them assigned`,
            `    space ${targetSpaceId}'s plugins could not be read with this token${target.status ? ` (${target.status})` : ""}, so the run cannot check them and goes on.`,
        ];
    }

    if (plugins.missing.length === 0) {
        return [
            `  field-type plugins: all ${plugins.used.length} the source uses are assigned to space ${targetSpaceId}`,
        ];
    }

    return [
        `  field-type plugins missing in target: ${formatFieldTypePluginList(plugins.missing)}`,
        `    the run refuses to write until space ${targetSpaceId} has them assigned; pass --allow-missing-plugins to write anyway (those components will be rejected).`,
    ];
};

const COPY_SPACE_LIST_LIMIT = 20;

export const formatCopySpacePlanGate = (
    summary: CopySpacePlanGateSummary,
): string[] => {
    const lines = [
        "PLAN",
        `  schema of space ${summary.sourceSpaceId} -> space ${summary.targetSpaceId} (${summary.resources.join(", ")})`,
    ];

    // The settings are written right after the languages, so they are stated
    // there too; first of all when the languages are not copied.
    const settingsLines = summary.settings
        ? formatCopySpaceSettings(summary.settings)
        : [];
    let settingsPlaced = settingsLines.length === 0;

    for (const line of summary.lines) {
        if (!settingsPlaced && line.resource !== "languages") {
            lines.push(...settingsLines);
            settingsPlaced = true;
        }

        lines.push(
            `  ${line.resource}: ${line.create} create, ${line.update} update, ${line.skip} skip`,
        );

        if (!settingsPlaced && line.resource === "languages") {
            lines.push(...settingsLines);
            settingsPlaced = true;
        }
    }

    if (!settingsPlaced) {
        lines.push(...settingsLines);
    }

    lines.push(
        `  never deletes: anything that exists only in space ${summary.targetSpaceId} is left as it is.`,
    );

    if (summary.droppedWhitelistGroups.length === 0) {
        lines.push("  dropped whitelist groups: none");
    } else {
        lines.push(
            `  dropped whitelist groups: ${summary.droppedWhitelistGroups.length} (no group of that path will exist in space ${summary.targetSpaceId})`,
        );

        for (const dropped of summary.droppedWhitelistGroups.slice(
            0,
            COPY_SPACE_LIST_LIMIT,
        )) {
            lines.push(
                `    ${dropped.component}.${dropped.field}: ${dropped.groupPath ?? "unknown group"} (${dropped.sourceGroupUuid})`,
            );
        }
    }

    if (
        summary.entriesStoryblokWillReject &&
        summary.entriesStoryblokWillReject.length > 0
    ) {
        lines.push(
            `  entries Storyblok will reject: ${summary.entriesStoryblokWillReject
                .map(
                    (rejected) =>
                        `${rejected.datasource} ${rejected.count} of ${rejected.total}`,
                )
                .join(", ")}`,
        );
    }

    if (summary.skipped.length > 0) {
        lines.push(`  skipped: ${summary.skipped.length}`);

        for (const skip of summary.skipped.slice(0, COPY_SPACE_LIST_LIMIT)) {
            lines.push(`    ${skip.name}: ${skip.reason}`);
        }
    }

    const listed = [...summary.droppedWhitelistGroups, ...summary.skipped];

    if (
        summary.droppedWhitelistGroups.length > COPY_SPACE_LIST_LIMIT ||
        summary.skipped.length > COPY_SPACE_LIST_LIMIT
    ) {
        lines.push(
            `    the full lists (${listed.length} items) are in the --outputPath report.`,
        );
    }

    if (summary.fieldTypePlugins) {
        lines.push(
            ...formatCopySpaceFieldTypePlugins(
                summary.fieldTypePlugins,
                summary.targetSpaceId,
            ),
        );
    }

    if (summary.presetsWithSourceAssetUrls > 0) {
        lines.push(
            `  preset images: ${summary.presetsWithSourceAssetUrls} ${summary.presetsWithSourceAssetUrls === 1 ? "preset keeps" : "presets keep"} image or icon URLs that point at space ${summary.sourceSpaceId}; they are reported, not rewritten.`,
        );
    }

    if (summary.componentsWithSourceImageUrls > 0) {
        lines.push(
            `  component images: ${summary.componentsWithSourceImageUrls} keep URLs that point at space ${summary.sourceSpaceId}`,
        );
    }

    if (
        summary.defaultPresets &&
        summary.defaultPresets.restore + summary.defaultPresets.notRestorable >
            0
    ) {
        lines.push(
            `  default presets: ${summary.defaultPresets.restore} restored, ${summary.defaultPresets.notRestorable} not restorable`,
        );
    }

    if (summary.componentsWithInternalTags > 0) {
        lines.push(
            `  internal tags: not copied (${summary.componentsWithInternalTags} ${summary.componentsWithInternalTags === 1 ? "component" : "components"} had tags)`,
        );
    }

    // With settings in scope the preview URLs (the space's environments) are
    // copied, so the closing line stops listing them.
    lines.push(
        summary.resources.includes("settings")
            ? "  not copied: stories, assets, workflow stages, roles, webhooks, collaborators, internal tags."
            : "  not copied: stories, assets, workflow stages, roles, webhooks, environments, collaborators, internal tags.",
    );

    return lines;
};
