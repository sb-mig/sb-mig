import { describe, expect, it } from "vitest";

import { summarizeMutationWriteResults } from "../../src/api/data-migration/write-summary.js";

describe("summarizeMutationWriteResults", () => {
    it("counts successful and failed fulfilled results", () => {
        const summary = summarizeMutationWriteResults([
            {
                status: "fulfilled",
                value: { ok: true, slug: "good-story" },
            },
            {
                status: "fulfilled",
                value: {
                    ok: false,
                    slug: "bad-story",
                    error: new Error("Unprocessable Content"),
                },
            },
        ]);

        expect(summary).toMatchObject({
            total: 2,
            successful: 1,
            failed: 1,
        });
        expect(summary.failedItems[0]?.slug).toBe("bad-story");
    });

    it("treats rejected results as failures", () => {
        const summary = summarizeMutationWriteResults([
            {
                status: "rejected",
                reason: new Error("network error"),
            },
        ]);

        expect(summary).toMatchObject({
            total: 1,
            successful: 0,
            failed: 1,
        });
        expect(summary.failedItems[0]?.ok).toBe(false);
    });
});
