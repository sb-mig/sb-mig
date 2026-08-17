import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect } from "vitest";

import {
    appendManifestEntry,
    loadManifest,
    writeManifest,
} from "../../../src/api/copy/manifest.js";

const tempFile = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-manifest-"));
    return path.join(dir, "manifest.jsonl");
};

const entry = (sourceId: number): any => ({
    type: "story",
    source_space_id: "1",
    target_space_id: "2",
    source_id: sourceId,
    target_id: sourceId + 1000,
    source_uuid: `u-${sourceId}`,
    target_uuid: `t-${sourceId}`,
    source_full_slug: `s/${sourceId}`,
    target_full_slug: `d/${sourceId}`,
    action: "created",
    created_at: "2026-08-17T00:00:00.000Z",
});

describe("manifest durability", () => {
    it("writeManifest leaves no temp file behind", async () => {
        const file = await tempFile();
        await writeManifest(file, [entry(1), entry(2)]);
        const files = await fs.readdir(path.dirname(file));
        expect(files).toEqual(["manifest.jsonl"]);
        expect(await loadManifest(file)).toHaveLength(2);
    });

    it("parallel appends produce valid jsonl with no lost lines", async () => {
        const file = await tempFile();
        await Promise.all(
            Array.from({ length: 200 }, (_, index) =>
                appendManifestEntry(file, entry(index)),
            ),
        );
        const entries = await loadManifest(file);
        expect(entries).toHaveLength(200);
        const ids = new Set(entries.map((item: any) => item.source_id));
        expect(ids.size).toBe(200);
    });
});
