import { describe, expect, it } from "vitest";

import {
    buildCopyRelinkPlanSummary,
    createEmptyCopyMaps,
    formatCopyRelinkPlan,
    planCopyRelinkStoryRewrite,
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
                "  ledger: 9 entries loaded from /repo/.sb-mig/copy/111/222/manifest.jsonl (resuming; use --fresh to ignore)",
                "  references: 2 will relink, 1 leave your selection and WILL BREAK",
                "    WILL BREAK, by story:",
                "      blog/post-2",
                "        content.header -> shared-header-uuid",
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
});
