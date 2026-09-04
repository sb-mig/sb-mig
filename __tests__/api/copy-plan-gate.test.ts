import { describe, expect, it } from "vitest";

import {
    buildCopyPlanGateSummary,
    createCopyGraph,
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
        sourceFullSlug: "blog",
        targetFullSlug: "imported/blog",
    },
    {
        type: "story" as const,
        sourceFullSlug: "blog/post-1",
        targetFullSlug: "imported/blog/post-1",
    },
    {
        type: "story" as const,
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
            sourceStoryFullSlug: "blog/post-1",
            referencedStoryId: 3,
            path: "content.related[0]",
            status: "will_relink",
        },
        {
            type: "story_reference",
            sourceStoryId: 2,
            sourceStoryFullSlug: "blog/post-1",
            referencedStoryUuid: "shared-header-uuid",
            path: "content.header",
            status: "will_break",
        },
        {
            type: "story_reference",
            sourceStoryId: 3,
            sourceStoryFullSlug: "blog/post-2",
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
        it("splits the plan into create, adopt and resume", () => {
            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan: [
                    plan[0],
                    {
                        // Mapped by the ledger to the story that really sits at
                        // the target path: a resume.
                        ...plan[1],
                        ledgerTargetStoryId: 9002,
                        existingTargetStoryId: 9002,
                    },
                    {
                        // Unmapped, but the path is taken: adopted in place.
                        ...plan[2],
                        existingTargetStoryId: 9003,
                    },
                ],
                ledger: { ...ledger, entries: 1 },
                withAssets: false,
            });

            expect(summary.stories).toEqual({
                total: 3,
                folders: 1,
                create: 1,
                resume: 1,
                adopt: 1,
                staleLedger: 0,
            });
            expect(summary.references).toEqual({
                scanned: false,
                total: 0,
                willRelink: 0,
                willBreak: 0,
                externalKept: 0,
                breaking: [],
            });
            expect(summary.assets).toBeUndefined();
        });

        it("discards ledger mappings the target no longer backs", () => {
            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan: [
                    plan[0],
                    {
                        // Mapped, but the target story is gone: a create.
                        ...plan[1],
                        ledgerTargetStoryId: 5555,
                    },
                    {
                        // Mapped, but a different story holds the path now:
                        // the run adopts that one instead.
                        ...plan[2],
                        ledgerTargetStoryId: 5556,
                        existingTargetStoryId: 9003,
                    },
                ],
                ledger: { ...ledger, entries: 2 },
                withAssets: false,
            });

            expect(summary.stories).toEqual({
                total: 3,
                folders: 1,
                create: 2,
                resume: 0,
                adopt: 1,
                staleLedger: 2,
            });
        });

        it("counts classified references and planned assets from the graph", () => {
            const summary = buildCopyPlanGateSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan,
                ledger,
                graph: graphWithReferences(),
                withAssets: true,
            });

            expect(summary.references).toMatchObject({
                scanned: true,
                total: 3,
                willRelink: 1,
                willBreak: 1,
                externalKept: 1,
            });
            expect(summary.references.breaking).toEqual([
                {
                    sourceStoryFullSlug: "blog/post-1",
                    references: [
                        expect.objectContaining({ path: "content.header" }),
                    ],
                },
            ]);
            expect(summary.assets).toEqual({ toCopy: 1, mapped: 1 });
        });
    });

    describe("formatCopyPlanGate", () => {
        it("prints an empty ledger, unscanned references and no assets honestly", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
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
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan: [
                        plan[0],
                        { ...plan[1], existingTargetStoryId: 9002 },
                        {
                            ...plan[2],
                            ledgerTargetStoryId: 9003,
                            existingTargetStoryId: 9003,
                        },
                    ],
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
                "    WILL BREAK, by story:",
                "      blog/post-1",
                "        content.header -> shared-header-uuid",
                "  assets: 1 will copy, 1 already mapped",
            ]);
        });

        it("states the translated slugs it will carry and the languages it cannot", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    ledger,
                    withAssets: false,
                    translatedSlugs: {
                        stories: 2,
                        carried: 3,
                        unsupported: 1,
                        unsupportedLangs: ["fr"],
                    },
                }),
            );

            expect(lines).toContain(
                "  translated slugs: 3 carried across 2 stories",
            );
            expect(lines).toContain(
                "    1 translated slug is left behind: space 222 has no language fr.",
            );
        });

        it("says nothing about translated slugs when the run found none", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    ledger,
                    withAssets: false,
                    translatedSlugs: {
                        stories: 0,
                        carried: 0,
                        unsupported: 0,
                        unsupportedLangs: [],
                    },
                }),
            );

            expect(
                lines.some((line) => line.includes("translated slug")),
            ).toBe(false);
        });

        it("says how many ledger mappings went stale", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan: [
                        { ...plan[0], ledgerTargetStoryId: 5554 },
                        { ...plan[1], ledgerTargetStoryId: 5555 },
                        plan[2],
                    ],
                    ledger: { ...ledger, entries: 2 },
                    withAssets: false,
                }),
            );

            expect(lines[1]).toBe(
                "  3 items (1 folder) -> space 222 (3 create, 0 adopt existing, 0 resume from ledger)",
            );
            expect(lines[2]).toBe(
                "    2 ledger mappings no longer resolve in space 222 and will be discarded.",
            );
        });

        it("caps the broken-reference listing and points at the dry run", () => {
            const graph = graphWithReferences();

            graph.storyReferences = Array.from({ length: 23 }, (_, index) => ({
                type: "story_reference" as const,
                sourceStoryId: 100 + index,
                sourceStoryFullSlug: `blog/post-${index}`,
                referencedStoryUuid: "shared-header-uuid",
                path: "content.header",
                status: "will_break" as const,
            }));

            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    ledger,
                    graph,
                    withAssets: false,
                }),
            );

            expect(lines).toContain("      blog/post-19");
            expect(lines).not.toContain("      blog/post-20");
            expect(lines).toContain(
                "      ...and 3 more stories with breaking references; run with --dryRun for the full list.",
            );
        });

        it("marks an ignored ledger and shows kept references on a same-space copy", () => {
            const lines = formatCopyPlanGate(
                buildCopyPlanGateSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "111",
                    plan,
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
