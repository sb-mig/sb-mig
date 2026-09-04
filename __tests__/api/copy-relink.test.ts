import { describe, expect, it } from "vitest";

import {
    buildCopyMaps,
    buildCopyRelinkClassificationMaps,
    buildCopyRelinkMaps,
    buildCopyRelinkPlanSummary,
    createEmptyCopyMaps,
    formatCopyRelinkPlan,
    planCopyRelinkStoryRewrite,
    selectRelinkLedgerAssetMappings,
    selectRelinkLedgerStoryMappings,
    type CopyManifestEntry,
    type CopyRelinkPlanItem,
} from "../../src/api/copy/index.js";

const ledger = {
    path: "/repo/.sb-mig/copy/111/222/manifest.jsonl",
    entries: 0,
    ignored: false,
};

const references = {
    scanned: true,
    total: 3,
    willRelink: 2,
    willBreak: 1,
    externalKept: 0,
    breaking: [
        {
            sourceStoryFullSlug: "blog/post-2",
            references: [
                {
                    type: "story_reference" as const,
                    sourceStoryId: 3,
                    referencedStoryUuid: "shared-header-uuid",
                    path: "content.header",
                    status: "will_break" as const,
                },
            ],
        },
    ],
};

const plan: CopyRelinkPlanItem[] = [
    {
        type: "folder",
        sourceFullSlug: "blog",
        targetFullSlug: "imported/blog",
        match: "adopted",
        rewrittenReferences: 0,
        changed: false,
    },
    {
        type: "story",
        sourceFullSlug: "blog/post-1",
        targetFullSlug: "imported/blog/post-1",
        match: "ledger",
        rewrittenReferences: 4,
        changed: true,
    },
    {
        type: "story",
        sourceFullSlug: "blog/post-2",
        targetFullSlug: "imported/blog/post-2",
        match: "adopted",
        rewrittenReferences: 0,
        changed: false,
    },
    {
        type: "story",
        sourceFullSlug: "blog/post-3",
        targetFullSlug: "imported/blog/post-3",
        match: "missing",
        rewrittenReferences: 0,
        changed: false,
    },
];

describe("copy relink", () => {
    describe("buildCopyRelinkPlanSummary", () => {
        it("counts how each planned story was matched and what will change", () => {
            const summary = buildCopyRelinkPlanSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan,
                ledger,
                references,
            });

            expect(summary.stories).toEqual({
                total: 4,
                folders: 1,
                fromLedger: 1,
                adopted: 2,
                missing: 1,
                toUpdate: 1,
                // The folder is neither updated nor "already correct".
                unchanged: 1,
            });
            expect(summary.rewrittenReferences).toBe(4);
            expect(summary.sameSpace).toBe(false);
        });

        it("never counts references of a story it will not write", () => {
            const summary = buildCopyRelinkPlanSummary({
                sourceSpaceId: "111",
                targetSpaceId: "222",
                plan: [
                    {
                        ...plan[1],
                        // A rewrite that maps every value to itself.
                        rewrittenReferences: 7,
                        changed: false,
                    },
                ],
                ledger,
                references,
            });

            expect(summary.rewrittenReferences).toBe(0);
            expect(summary.stories.toUpdate).toBe(0);
        });
    });

    describe("formatCopyRelinkPlan", () => {
        it("states the matches, the exact rewrite and what it will not do", () => {
            const lines = formatCopyRelinkPlan(
                buildCopyRelinkPlanSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan,
                    ledger: { ...ledger, entries: 9 },
                    references,
                }),
            );

            expect(lines).toEqual([
                "PLAN",
                "  4 planned items (1 folder) in space 222 (1 mapped by ledger, 2 adopted by target path, 1 missing from target)",
                "    2 target stories will be added to the ledger as matched_by_target_key.",
                "    1 planned story is not in the target and cannot be relinked; copy it first.",
                // relink has no --fresh, so the shared ledger line must not
                // advertise it.
                "  ledger: 9 entries loaded from /repo/.sb-mig/copy/111/222/manifest.jsonl (completing the mapping from the target space)",
                // The counts come from the source scan; the rewrite line below
                // is the target. The label says so instead of implying one is
                // the other.
                "  source references: 2 will relink, 1 leave your selection and WILL BREAK",
                "    Counted in the source content this selection covers, against the mapping above; the rewrite line below is what changes in the target.",
                "    WILL BREAK, by story:",
                "      blog/post-2",
                "        content.header -> shared-header-uuid",
                "    References into the story missing from the target cannot be repaired here; copy it first, then relink again.",
                "  rewrite: 4 references in 1 story; 1 already correct and left untouched",
                "  content: only reference values change; nothing is copied from the source",
            ]);
        });

        it("says plainly when there is nothing to repair", () => {
            const lines = formatCopyRelinkPlan(
                buildCopyRelinkPlanSummary({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    plan: [plan[2]],
                    ledger,
                    references: { ...references, willBreak: 0, breaking: [] },
                }),
            );

            expect(lines).toContain(
                "  rewrite: 0 references in 0 stories; 1 already correct and left untouched",
            );
            expect(lines).not.toContain(
                "    1 planned story is not in the target and cannot be relinked; copy it first.",
            );
        });
    });

    describe("planCopyRelinkStoryRewrite", () => {
        const brokenContent = () => ({
            component: "page",
            cta: {
                linktype: "story",
                id: 1,
                uuid: "source-blog-uuid",
            },
        });

        it("remaps the target story's own references", () => {
            const maps = createEmptyCopyMaps();

            maps.storyIds.set(1, 1001);
            maps.storyUuids.set("source-blog-uuid", "target-blog-uuid");

            const rewrite = planCopyRelinkStoryRewrite({
                content: brokenContent(),
                maps,
            });

            expect(rewrite.changed).toBe(true);
            expect(rewrite.content).toEqual({
                component: "page",
                cta: {
                    linktype: "story",
                    id: 1001,
                    uuid: "target-blog-uuid",
                },
            });
        });

        it("reports no change when nothing in the mapping applies", () => {
            const maps = createEmptyCopyMaps();

            maps.storyUuids.set("some-other-uuid", "target-other-uuid");

            const rewrite = planCopyRelinkStoryRewrite({
                content: brokenContent(),
                maps,
            });

            expect(rewrite.changed).toBe(false);
            expect(rewrite.rewrittenReferences).toBe(0);
            expect(rewrite.content).toEqual(brokenContent());
        });

        it("reports no change when every mapped value maps to itself", () => {
            const maps = createEmptyCopyMaps();

            maps.storyIds.set(1, 1);
            maps.storyUuids.set("source-blog-uuid", "source-blog-uuid");

            const rewrite = planCopyRelinkStoryRewrite({
                content: brokenContent(),
                maps,
            });

            // Whatever the rewriter records, the stored content is identical,
            // so the story must not be written.
            expect(rewrite.changed).toBe(false);
            expect(rewrite.content).toEqual(brokenContent());
        });
    });

    describe("buildCopyRelinkMaps", () => {
        const ledgerEntry = (
            overrides: Partial<CopyManifestEntry> = {},
        ): CopyManifestEntry =>
            ({
                type: "story",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 1,
                target_id: 1001,
                source_uuid: "source-blog-uuid",
                target_uuid: "target-blog-uuid",
                source_full_slug: "blog",
                target_full_slug: "imported/blog",
                action: "created",
                created_at: "2026-09-03T00:00:00.000Z",
                ...overrides,
            }) as CopyManifestEntry;

        it("carries only validated mappings, never the ledger's own", () => {
            const maps = buildCopyRelinkMaps({
                storyMappings: [
                    {
                        sourceId: 1,
                        sourceUuid: "source-blog-uuid",
                        targetId: 1001,
                        targetUuid: "target-blog-uuid",
                        sourceFullSlug: "blog",
                        targetFullSlug: "imported/blog",
                    },
                ],
                assetMappings: [
                    {
                        sourceId: 7,
                        sourceFilename: "a.png",
                        targetId: 7007,
                        targetFilename: "b.png",
                    },
                ],
            });

            expect(maps.storyIds.get(1)).toBe(1001);
            expect(maps.storyFullSlugs.get("target-blog-uuid")).toBe(
                "imported/blog",
            );
            expect(maps.storyIdFullSlugs.get(1001)).toBe("imported/blog");
            expect(maps.assetIds.get(7)).toEqual({
                id: 7007,
                filename: "b.png",
            });
            expect(maps.assetFilenames.get("a.png")).toBe("b.png");
        });

        it("cannot be handed the ledger's unvalidated mappings at all", () => {
            const ledgerMaps = buildCopyMaps([
                ledgerEntry(),
                ledgerEntry({
                    source_id: 3,
                    source_uuid: "source-gone-uuid",
                    target_id: 3003,
                    target_uuid: "deleted-target-uuid",
                }),
                {
                    type: "asset",
                    source_space_id: "111",
                    target_space_id: "222",
                    source_id: 7,
                    target_id: 7007,
                    source_filename: "a.png",
                    target_filename: "deleted-target.png",
                    action: "created",
                    created_at: "2026-09-03T00:00:00.000Z",
                } as CopyManifestEntry,
            ]);

            // Nothing the ledger claims — story or file — reaches a map the
            // rewriter writes through until this run has proven it.
            const maps = buildCopyRelinkMaps({ storyMappings: [] });

            expect(ledgerMaps.storyUuids.has("source-gone-uuid")).toBe(true);
            expect(ledgerMaps.assetFilenames.has("a.png")).toBe(true);
            expect(maps.storyUuids.size).toBe(0);
            expect(maps.assetIds.size).toBe(0);
            expect(maps.assetFilenames.size).toBe(0);
        });
    });

    describe("buildCopyRelinkClassificationMaps", () => {
        it("keeps what the ledger covers and drops only what was proven stale", () => {
            const ledgerMaps = createEmptyCopyMaps();

            ledgerMaps.storyIds.set(5, 5005);
            ledgerMaps.storyUuids.set(
                "shared-header-uuid",
                "target-header-uuid",
            );
            ledgerMaps.storyIds.set(3, 3003);
            ledgerMaps.storyUuids.set(
                "source-gone-uuid",
                "deleted-target-uuid",
            );

            const maps = buildCopyRelinkClassificationMaps({
                ledgerMaps,
                storyMappings: [
                    {
                        sourceId: 1,
                        sourceUuid: "source-blog-uuid",
                        targetId: 1001,
                        targetUuid: "target-blog-uuid",
                        sourceFullSlug: "blog",
                        targetFullSlug: "imported/blog",
                    },
                ],
                staleStoryKeys: [
                    { sourceId: 3, sourceUuid: "source-gone-uuid" },
                ],
            });

            // A reference the ledger covers is not a break just because this
            // run never had to touch it...
            expect(maps.storyUuids.get("shared-header-uuid")).toBe(
                "target-header-uuid",
            );
            expect(maps.storyUuids.get("source-blog-uuid")).toBe(
                "target-blog-uuid",
            );
            // ...but a mapping this run proved stale cannot be counted as one.
            expect(maps.storyIds.has(3)).toBe(false);
            expect(maps.storyUuids.has("source-gone-uuid")).toBe(false);
            // The ledger's own maps are not mutated.
            expect(ledgerMaps.storyIds.has(3)).toBe(true);
        });
    });

    describe("selectRelinkLedgerStoryMappings", () => {
        const entries: CopyManifestEntry[] = [
            {
                type: "story",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 5,
                target_id: 5005,
                source_uuid: "shared-header-uuid",
                target_uuid: "target-header-uuid",
                source_full_slug: "shared/header",
                target_full_slug: "imported/shared/header",
                action: "created",
                created_at: "2026-09-03T00:00:00.000Z",
            },
            {
                type: "story",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 6,
                target_id: 6006,
                source_uuid: "unreferenced-uuid",
                target_uuid: "target-unreferenced-uuid",
                source_full_slug: "shared/footer",
                target_full_slug: "imported/shared/footer",
                action: "created",
                created_at: "2026-09-03T00:00:00.000Z",
            },
        ];

        it("picks the out-of-selection mappings the target content mentions", () => {
            const mappings = selectRelinkLedgerStoryMappings({
                entries,
                plannedSourceIds: new Set([1, 2]),
                targetContents: [
                    {
                        component: "page",
                        header: { uuid: "shared-header-uuid" },
                    },
                ],
            });

            expect(mappings).toEqual([
                {
                    sourceId: 5,
                    sourceUuid: "shared-header-uuid",
                    targetId: 5005,
                    targetUuid: "target-header-uuid",
                    sourceFullSlug: "shared/header",
                    targetFullSlug: "imported/shared/header",
                },
            ]);
        });

        it("leaves planned stories to the run's own target matching", () => {
            expect(
                selectRelinkLedgerStoryMappings({
                    entries,
                    plannedSourceIds: new Set([5, 6]),
                    targetContents: [
                        {
                            component: "page",
                            header: { uuid: "shared-header-uuid" },
                        },
                    ],
                }),
            ).toEqual([]);
        });
    });

    describe("selectRelinkLedgerAssetMappings", () => {
        const assetEntries: CopyManifestEntry[] = [
            {
                type: "asset",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 70,
                target_id: 7007,
                source_filename: "https://a.storyblok.com/f/111/logo.png",
                target_filename: "https://a.storyblok.com/f/222/logo.png",
                action: "created",
                created_at: "2026-09-03T00:00:00.000Z",
            },
            {
                type: "asset",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 80,
                target_id: 8008,
                source_filename: "https://a.storyblok.com/f/111/unused.png",
                target_filename: "https://a.storyblok.com/f/222/unused.png",
                action: "created",
                created_at: "2026-09-03T00:00:00.000Z",
            },
        ];

        it("picks the asset mappings the target content still mentions", () => {
            const mappings = selectRelinkLedgerAssetMappings({
                entries: assetEntries,
                targetContents: [
                    {
                        component: "page",
                        image: {
                            id: 70,
                            filename: "https://a.storyblok.com/f/111/logo.png",
                        },
                    },
                ],
            });

            expect(mappings).toEqual([
                {
                    sourceId: 70,
                    sourceFilename: "https://a.storyblok.com/f/111/logo.png",
                    targetId: 7007,
                    targetFilename: "https://a.storyblok.com/f/222/logo.png",
                },
            ]);
        });

        it("ignores content that already carries the target's file", () => {
            // Nothing left to rewrite there, so nothing worth a lookup.
            expect(
                selectRelinkLedgerAssetMappings({
                    entries: assetEntries,
                    targetContents: [
                        {
                            component: "page",
                            image: {
                                id: 7007,
                                filename:
                                    "https://a.storyblok.com/f/222/logo.png",
                            },
                        },
                    ],
                }),
            ).toEqual([]);
        });
    });
});
