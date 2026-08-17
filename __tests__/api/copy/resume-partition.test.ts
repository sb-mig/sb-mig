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
    ...overrides,
});

const stub = (id: number, updated_at = "2026-08-17T00:00:00.000Z") => ({
    id,
    updated_at,
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
            checkpoints,
            verify: false,
            forceContent: false,
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
                checkpoints,
                ...flags,
            });
            expect(partition.fastPathSourceIds.size).toBe(0);
        }
    });
});
