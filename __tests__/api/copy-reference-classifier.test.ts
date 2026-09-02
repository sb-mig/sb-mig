import type {
    CopyGraphStoryNode,
    CopyGraphStoryReference,
    CopyMaps,
} from "../../src/api/copy/types.js";

import { describe, expect, it } from "vitest";

import {
    buildCopyReferenceSelection,
    classifyStoryReferences,
    countStoryReferenceStatuses,
    createEmptyCopyMaps,
    createEmptyCopyReferenceSelection,
    describeBrokenStoryReferenceTarget,
    groupBrokenStoryReferences,
} from "../../src/api/copy/index.js";

const storyNode = (
    sourceId: number,
    sourceUuid: string,
    sourceFullSlug: string,
): CopyGraphStoryNode => ({
    type: "story",
    sourceId,
    sourceUuid,
    sourceFullSlug,
    action: "create",
});

const reference = (
    overrides: Partial<CopyGraphStoryReference>,
): CopyGraphStoryReference => ({
    type: "story_reference",
    sourceStoryId: 10,
    sourceStoryUuid: "page-one-uuid",
    sourceStoryFullSlug: "probe/pages/page-one",
    path: "content.ref_link.id",
    status: "unclassified",
    ...overrides,
});

const ledgerWith = ({
    storyIds = [] as Array<[number, number]>,
    storyUuids = [] as Array<[string, string]>,
}): CopyMaps => {
    const maps = createEmptyCopyMaps();

    for (const [source, target] of storyIds) {
        maps.storyIds.set(source, target);
    }

    for (const [source, target] of storyUuids) {
        maps.storyUuids.set(source, target);
    }

    return maps;
};

const classify = (
    references: CopyGraphStoryReference[],
    {
        stories = [] as CopyGraphStoryNode[],
        copyMaps = createEmptyCopyMaps(),
        sameSpace = false,
    } = {},
) =>
    classifyStoryReferences({
        storyReferences: references,
        selection: buildCopyReferenceSelection(stories),
        copyMaps,
        sameSpace,
    });

describe("copy reference classifier", () => {
    describe("buildCopyReferenceSelection", () => {
        it("collects plan story ids and uuids", () => {
            const selection = buildCopyReferenceSelection([
                storyNode(10, "page-one-uuid", "probe/pages/page-one"),
                storyNode(11, "page-two-uuid", "probe/pages/page-two"),
            ]);

            expect(Array.from(selection.storyIds)).toEqual([10, 11]);
            expect(Array.from(selection.storyUuids)).toEqual([
                "page-one-uuid",
                "page-two-uuid",
            ]);
        });

        it("ignores unresolved plan items carrying sourceId 0", () => {
            const selection = buildCopyReferenceSelection([
                { ...storyNode(0, "", "probe/pages"), sourceUuid: undefined },
            ]);

            expect(selection.storyIds.size).toBe(0);
            expect(selection.storyUuids.size).toBe(0);
        });

        it("creates an empty selection", () => {
            const selection = createEmptyCopyReferenceSelection();

            expect(selection.storyIds.size).toBe(0);
            expect(selection.storyUuids.size).toBe(0);
        });
    });

    describe("classifyStoryReferences", () => {
        it("marks a reference into the selection will_relink by uuid", () => {
            const [classified] = classify(
                [reference({ referencedStoryUuid: "shared-header-uuid" })],
                {
                    stories: [
                        storyNode(
                            20,
                            "shared-header-uuid",
                            "probe/shared/shared-header",
                        ),
                    ],
                },
            );

            expect(classified.status).toBe("will_relink");
        });

        it("marks a reference into the selection will_relink by id", () => {
            const [classified] = classify(
                [reference({ referencedStoryId: 20 })],
                {
                    stories: [
                        storyNode(
                            20,
                            "shared-header-uuid",
                            "probe/shared/shared-header",
                        ),
                    ],
                },
            );

            expect(classified.status).toBe("will_relink");
        });

        it("marks a reference already in the ledger will_relink", () => {
            const [classified] = classify(
                [reference({ referencedStoryUuid: "earlier-copy-uuid" })],
                {
                    copyMaps: ledgerWith({
                        storyUuids: [["earlier-copy-uuid", "target-uuid"]],
                    }),
                },
            );

            expect(classified.status).toBe("will_relink");
        });

        it("marks an out-of-scope reference will_break in a cross-space copy", () => {
            const [classified] = classify([
                reference({ referencedStoryUuid: "playground-page-uuid" }),
            ]);

            expect(classified.status).toBe("will_break");
        });

        it("marks an out-of-scope reference external_kept in a same-space copy", () => {
            const [classified] = classify(
                [reference({ referencedStoryUuid: "playground-page-uuid" })],
                { sameSpace: true },
            );

            expect(classified.status).toBe("external_kept");
        });

        it("still relinks in-scope references in a same-space copy", () => {
            const [classified] = classify(
                [reference({ referencedStoryUuid: "shared-header-uuid" })],
                {
                    sameSpace: true,
                    stories: [
                        storyNode(
                            20,
                            "shared-header-uuid",
                            "probe/shared/shared-header",
                        ),
                    ],
                },
            );

            expect(classified.status).toBe("will_relink");
        });

        it("never breaks parent_id, which the copy plan resolves structurally", () => {
            const [classified] = classify([
                reference({ path: "parent_id", referencedStoryId: 999 }),
            ]);

            expect(classified.status).toBe("will_relink");
        });

        it("leaves scanner-decided statuses untouched", () => {
            const classified = classify([
                reference({
                    referencedStoryUuid: "playground-page-uuid",
                    status: "unresolved",
                }),
                reference({
                    referencedStoryUuid: "playground-page-uuid",
                    status: "unsupported",
                }),
            ]);

            expect(classified.map((item) => item.status)).toEqual([
                "unresolved",
                "unsupported",
            ]);
        });

        it("does not mutate the references it is given", () => {
            const original = reference({
                referencedStoryUuid: "playground-page-uuid",
            });

            classify([original]);

            expect(original.status).toBe("unclassified");
        });
    });

    describe("countStoryReferenceStatuses", () => {
        it("counts every status bucket", () => {
            const counts = countStoryReferenceStatuses([
                reference({ status: "will_relink" }),
                reference({ status: "will_relink" }),
                reference({ status: "will_break" }),
                reference({ status: "external_kept" }),
                reference({ status: "unresolved" }),
                reference({ status: "unsupported" }),
                reference({ status: "unclassified" }),
            ]);

            expect(counts).toEqual({
                willRelink: 2,
                willBreak: 1,
                externalKept: 1,
                unresolved: 1,
                unsupported: 1,
                unclassified: 1,
            });
        });
    });

    describe("groupBrokenStoryReferences", () => {
        it("groups breaks by the story that holds them", () => {
            const groups = groupBrokenStoryReferences([
                reference({
                    status: "will_break",
                    path: "content.ref_link.id",
                    referencedStoryUuid: "outside-uuid",
                }),
                reference({
                    status: "will_break",
                    path: "content.body[0].reference",
                    referencedStoryUuid: "outside-uuid",
                }),
                reference({
                    status: "will_relink",
                    path: "content.related",
                }),
                reference({
                    status: "will_break",
                    sourceStoryFullSlug: "probe/pages/page-four",
                    path: "content.ref_link.id",
                    referencedStoryId: 777,
                }),
            ]);

            expect(
                groups.map((group) => [
                    group.sourceStoryFullSlug,
                    group.references.map((item) => item.path),
                ]),
            ).toEqual([
                [
                    "probe/pages/page-one",
                    ["content.ref_link.id", "content.body[0].reference"],
                ],
                ["probe/pages/page-four", ["content.ref_link.id"]],
            ]);
        });

        it("falls back to the source story id when the slug is missing", () => {
            const [group] = groupBrokenStoryReferences([
                reference({
                    status: "will_break",
                    sourceStoryFullSlug: undefined,
                    sourceStoryId: 42,
                }),
            ]);

            expect(group.sourceStoryFullSlug).toBe("#42");
        });
    });

    describe("describeBrokenStoryReferenceTarget", () => {
        it("prefers the uuid, then the id", () => {
            expect(
                describeBrokenStoryReferenceTarget(
                    reference({ referencedStoryUuid: "outside-uuid" }),
                ),
            ).toBe("outside-uuid");
            expect(
                describeBrokenStoryReferenceTarget(
                    reference({ referencedStoryId: 777 }),
                ),
            ).toBe("#777");
            expect(describeBrokenStoryReferenceTarget(reference({}))).toBe(
                "<unknown target>",
            );
        });
    });
});
