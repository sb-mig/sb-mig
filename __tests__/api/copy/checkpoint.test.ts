import { describe, it, expect } from "vitest";

import {
    buildContentCheckpointMap,
    computeContentHash,
} from "../../../src/api/copy/checkpoint.js";

describe("computeContentHash", () => {
    it("is stable across key order", () => {
        const a = computeContentHash({
            payload: { content: { b: 1, a: [{ y: 2, x: 1 }] } },
            publicationMode: "preserve-layers",
            publishLanguages: ["en", "de"],
        });
        const b = computeContentHash({
            payload: { content: { a: [{ x: 1, y: 2 }], b: 1 } },
            publicationMode: "preserve-layers",
            publishLanguages: ["de", "en"],
        });
        expect(a).toBe(b);
        expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("changes when a mapped reference changes the payload", () => {
        const base = { content: { link: "uuid-old" } };
        const rewritten = { content: { link: "uuid-new" } };
        expect(
            computeContentHash({ payload: base, publicationMode: "save-only" }),
        ).not.toBe(
            computeContentHash({
                payload: rewritten,
                publicationMode: "save-only",
            }),
        );
    });

    it("changes when the publication mode changes", () => {
        const payload = { content: {} };
        expect(
            computeContentHash({ payload, publicationMode: "save-only" }),
        ).not.toBe(
            computeContentHash({ payload, publicationMode: "collapse-draft" }),
        );
    });

    it("omits object properties with undefined values (matches wire semantics)", () => {
        const withUndefined = computeContentHash({
            payload: { content: { a: undefined } },
            publicationMode: "save-only",
        });
        const withoutKey = computeContentHash({
            payload: { content: {} },
            publicationMode: "save-only",
        });
        expect(withUndefined).toBe(withoutKey);
    });

    it("distinguishes between undefined and null values", () => {
        const withUndefined = computeContentHash({
            payload: { content: { a: undefined } },
            publicationMode: "save-only",
        });
        const withNull = computeContentHash({
            payload: { content: { a: null } },
            publicationMode: "save-only",
        });
        expect(withUndefined).not.toBe(withNull);
    });

    it("serializes undefined array elements as null", () => {
        const withUndefinedArray = computeContentHash({
            payload: { content: { list: [undefined] } },
            publicationMode: "save-only",
        });
        const withNullArray = computeContentHash({
            payload: { content: { list: [null] } },
            publicationMode: "save-only",
        });
        expect(withUndefinedArray).toBe(withNullArray);
    });
});

describe("buildContentCheckpointMap", () => {
    it("keeps the last checkpoint per source id and ignores other types", () => {
        const entries: any[] = [
            { type: "story", source_id: 1 },
            {
                type: "story_content",
                source_id: 1,
                content_hash: "sha256:old",
            },
            {
                type: "story_content",
                source_id: 1,
                content_hash: "sha256:new",
            },
            { type: "asset", source_id: 9 },
        ];
        const map = buildContentCheckpointMap(entries);
        expect(map.size).toBe(1);
        expect(map.get(1)?.content_hash).toBe("sha256:new");
    });
});
