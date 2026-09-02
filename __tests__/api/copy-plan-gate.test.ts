import { describe, expect, it } from "vitest";

import {
    buildCopyPlanGateSummary,
    createCopyGraph,
    createEmptyCopyMaps,
    formatCopyPlanGate,
} from "../../src/api/copy/index.js";

const ledger = {
    path: "/repo/.sb-mig/copy/111/222/manifest.jsonl",
    entries: 0,
    ignored: false,
};

const plan = [
    {
        type: "folder" as const,
        sourceId: 1,
        sourceFullSlug: "blog",
        targetFullSlug: "imported/blog",
    },
    {
        type: "story" as const,
        sourceId: 2,
        sourceFullSlug: "blog/post-1",
        targetFullSlug: "imported/blog/post-1",
    },
    {
        type: "story" as const,
        sourceId: 3,
        sourceFullSlug: "blog/post-2",
        targetFullSlug: "imported/blog/post-2",
    },
];

const graphWithReferences = () => {
    const graph = createCopyGraph({
        sourceSpaceId: "111",
        targetSpaceId: "222",
        scope: {
            command: "copy stories",
            source: "blog",
            destination: "imported",
            mode: "subtree",
            withAssets: true,
            referencePolicy: "preserve",
        },
    });

    graph.storyReferences.push(
        {
            type: "story_reference",
            sourceStoryId: 2,
            referencedStoryId: 3,
            path: "content.related[0]",
            status: "will_relink",
        },
        {
            type: "story_reference",
            sourceStoryId: 2,
            referencedStoryUuid: "shared-header-uuid",
            path: "content.header",
            status: "will_break",
        },
        {
            type: "story_reference",
            sourceStoryId: 3,
            referencedStoryUuid: "shared-footer-uuid",
            path: "content.footer",
            status: "external_kept",
        },
    );
    graph.assets.push(
        {
            type: "asset",
            sourceId: 300,
            sourceFilename: "https://a.storyblok.com/f/111/a.jpg",
            action: "create",
        },
        {
            type: "asset",
            sourceId: 301,
            sourceFilename: "https://a.storyblok.com/f/111/b.jpg",
            action: "match",
        },
    );

    return graph;
};

describe("copy plan gate", () => {
    describe("buildCopyPlanGateSummary", () => {
        it("splits the plan into create, adopt and resume by ledger first, then target path", () => {
            const copyMaps = createEmptyCopyMaps();
            copyMaps.storyIds.set(2, 9002);

            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan,
                // post-1 also exists at the target, but the ledger wins.
                conflictTargetFullSlugs: [
                    "imported/blog/post-1",
                    "imported/blog/post-2",
                ],
                copyMaps,
                ledger: { ...ledger, entries: 1 },
                withAssets: false,
            });

            expect(summary.stories).toEqual({
                total: 3,
                folders: 1,
                create: 1,
                resume: 1,
                adopt: 1,
            });
            expect(summary.references).toEqual({
                scanned: false,
                total: 0,
                willRelink: 0,
                willBreak: 0,
                externalKept: 0,
            });
            expect(summary.assets).toBeUndefined();
        });

        it("counts classified references and planned assets from the graph", () => {
            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan,
                conflictTargetFullSlugs: [],
                copyMaps: createEmptyCopyMaps(),
                ledger,
                graph: graphWithReferences(),
                withAssets: true,
            });

            expect(summary.references).toEqual({
                scanned: true,
                total: 3,
                willRelink: 1,
                willBreak: 1,
                externalKept: 1,
            });
            expect(summary.assets).toEqual({ toCopy: 1, mapped: 1 });
        });

        it("treats plan items without a resolved source id as creates", () => {
            const copyMaps = createEmptyCopyMaps();
            copyMaps.storyIds.set(2, 9002);

            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan: plan.map(({ sourceId: _sourceId, ...item }) => item),
                conflictTargetFullSlugs: [],
                copyMaps,
                ledger,
                withAssets: false,
            });

            expect(summary.stories).toMatchObject({
                create: 3,
                resume: 0,
                adopt: 0,
            });
        });
    });

    describe("formatCopyPlanGate", () => {
        it("prints an empty ledger, unscanned references and no assets honestly", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    conflictTargetFullSlugs: [],
                    copyMaps: createEmptyCopyMaps(),
                    ledger,
                    withAssets: false,
                }),
            );

            expect(lines).toEqual([
                "PLAN",
                "  3 items (1 folder) -> space 222 (3 create, 0 adopt existing, 0 resume from ledger)",
                "  ledger: none at /repo/.sb-mig/copy/111/222/manifest.jsonl (starting empty)",
                "  references: not scanned",
                "  assets: not copied (pass --with-assets)",
            ]);
        });

        it("names adoption, resumption, breaking references and assets", () => {
            const copyMaps = createEmptyCopyMaps();
            copyMaps.storyIds.set(3, 9003);

            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    conflictTargetFullSlugs: ["imported/blog/post-1"],
                    copyMaps,
                    ledger: { ...ledger, entries: 11 },
                    graph: graphWithReferences(),
                    withAssets: true,
                }),
            );

            expect(lines).toEqual([
                "PLAN",
                "  3 items (1 folder) -> space 222 (1 create, 1 adopt existing, 1 resume from ledger)",
                "    1 existing target path will be adopted and UPDATED in place.",
                "  ledger: 11 entries loaded from /repo/.sb-mig/copy/111/222/manifest.jsonl (resuming; use --fresh to ignore)",
                "  references: 1 will relink, 1 leave your selection and WILL BREAK",
                "  assets: 1 will copy, 1 already mapped",
            ]);
        });

        it("marks an ignored ledger and shows kept references on a same-space copy", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "111",
                    plan,
                    conflictTargetFullSlugs: [],
                    copyMaps: createEmptyCopyMaps(),
                    ledger: { ...ledger, entries: 1, ignored: true },
                    graph: graphWithReferences(),
                    withAssets: false,
                }),
            );

            expect(lines[2]).toBe(
                "  ledger: 1 entry at /repo/.sb-mig/copy/111/222/manifest.jsonl IGNORED (--fresh; starting empty)",
            );
            expect(lines[3]).toBe(
                "  references: 1 will relink, 1 outside the selection kept (same space), 1 leave your selection and WILL BREAK",
            );
        });
    });
});
