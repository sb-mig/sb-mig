import { describe, it, expect } from "vitest";

import { partitionStoriesForResume } from "../../../src/api/copy/resume-partition.js";

const checkpoint = (sourceId: number, overrides: any = {}) => ({
    type: "story_content" as const,
    schema_version: 1 as const,
    source_space_id: "1",
    target_space_id: "2",
    source_id: sourceId,
    target_id: sourceId + 1000,
    source_updated_at: "2026-08-17T00:00:00.000Z",
    content_hash: "sha256:x",
    unresolved_refs: 0,
    created_at: "2026-08-17T00:00:00.000Z",
    publication_mode: "preserve-layers",
    publish_languages: ["[default]"],
    target_full_slug: `imported/s/${sourceId}`,
    ...overrides,
});

const stub = (id: number, updated_at = "2026-08-17T00:00:00.000Z") => ({
    id,
    updated_at,
});

const baseGateArgs = (
    checkpoints: Map<number, any>,
    overrides: Partial<{
        verify: boolean;
        forceContent: boolean;
        publicationMode: string;
        publishLanguages: string[] | undefined;
        targetFullSlugBySourceId: Map<number, string>;
        mappedSourceIds: Set<number>;
    }> = {},
) => ({
    checkpoints,
    verify: false,
    forceContent: false,
    publicationMode: "preserve-layers",
    publishLanguages: ["[default]"],
    targetFullSlugBySourceId: new Map([
        [1, "imported/s/1"],
        [2, "imported/s/2"],
        [3, "imported/s/3"],
        [4, "imported/s/4"],
    ]),
    mappedSourceIds: new Set([1, 2, 3, 4]),
    ...overrides,
});

describe("partitionStoriesForResume", () => {
    const checkpoints = new Map([
        [1, checkpoint(1)],
        [2, checkpoint(2, { unresolved_refs: 3 })],
        [3, checkpoint(3)],
    ]);

    it("fast-paths unchanged, fully-resolved, checkpointed stories", () => {
        const partition = partitionStoriesForResume({
            listStories: [
                stub(1), // fast path
                stub(2), // unresolved refs -> content
                stub(3, "2026-08-18T00:00:00.000Z"), // edited -> content
                stub(4), // no checkpoint -> content
            ],
            ...baseGateArgs(checkpoints),
        });
        expect([...partition.fastPathSourceIds]).toEqual([1]);
        expect([...partition.needsContentIds].sort()).toEqual([2, 3, 4]);
    });

    it("verify and forceContent disable the fast path", () => {
        for (const flags of [
            { verify: true, forceContent: false },
            { verify: false, forceContent: true },
        ]) {
            const partition = partitionStoriesForResume({
                listStories: [stub(1)],
                ...baseGateArgs(checkpoints, flags),
            });
            expect(partition.fastPathSourceIds.size).toBe(0);
        }
    });

    it("a publication mode change disables the fast path", () => {
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(checkpoints, { publicationMode: "collapse-draft" }),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
        expect(partition.needsContentIds.has(1)).toBe(true);
    });

    it("a publish languages change disables the fast path", () => {
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(checkpoints, {
                publishLanguages: ["[default]", "de"],
            }),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
    });

    it("publish languages equal regardless of order still fast-paths", () => {
        const reorderedCheckpoints = new Map([
            [
                1,
                checkpoint(1, {
                    publish_languages: ["de", "[default]"],
                }),
            ],
        ]);
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(reorderedCheckpoints, {
                publishLanguages: ["[default]", "de"],
            }),
        });
        expect([...partition.fastPathSourceIds]).toEqual([1]);
    });

    it("a destination change (target full slug mismatch) disables the fast path", () => {
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(checkpoints, {
                targetFullSlugBySourceId: new Map([[1, "moved/s/1"]]),
            }),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
        expect(partition.needsContentIds.has(1)).toBe(true);
    });

    it("a missing planned target full slug disables the fast path", () => {
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(checkpoints, {
                targetFullSlugBySourceId: new Map(),
            }),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
    });

    it("a checkpoint missing publication_mode/target_full_slug (old schema) disables the fast path", () => {
        const legacyCheckpoints = new Map([
            [
                1,
                checkpoint(1, {
                    publication_mode: undefined,
                    publish_languages: undefined,
                    target_full_slug: undefined,
                }),
            ],
        ]);
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(legacyCheckpoints),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
    });

    it("a checkpoint with no story shell mapping disables the fast path (M7)", () => {
        const partition = partitionStoriesForResume({
            listStories: [stub(1)],
            ...baseGateArgs(checkpoints, {
                mappedSourceIds: new Set(), // no shell mapping for id 1
            }),
        });
        expect(partition.fastPathSourceIds.size).toBe(0);
        expect(partition.needsContentIds.has(1)).toBe(true);
    });
});
