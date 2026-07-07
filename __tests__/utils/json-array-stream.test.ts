import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    readJsonArrayStreamed,
    writeJsonArrayStreamed,
} from "../../src/utils/files.js";

let tmpDir: string;
const file = (name: string) => path.join(tmpDir, name);

const write = (name: string, content: string) => {
    const p = file(name);
    fs.writeFileSync(p, content);
    return p;
};

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sbmig-jsonstream-"));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readJsonArrayStreamed", () => {
    it("reads an empty array", async () => {
        expect(await readJsonArrayStreamed(write("a.json", "[]"))).toEqual([]);
    });

    it("reads a pretty-printed array of objects", async () => {
        const data = [{ id: 1, name: "one" }, { id: 2, name: "two" }];
        const p = write("b.json", JSON.stringify(data, null, 2));
        expect(await readJsonArrayStreamed(p)).toEqual(data);
    });

    it("handles strings containing structural characters and escapes", async () => {
        const data = [
            { text: "comma, bracket ] brace } quote \" end" },
            { text: "back\\slash and \"quoted\"", nested: { a: [1, 2, "]"] } },
            { text: "line\nbreak\tand unicode ✓ é 你好" },
        ];
        const p = write("c.json", JSON.stringify(data, null, 2));
        expect(await readJsonArrayStreamed(p)).toEqual(data);
    });

    it("handles deeply nested objects and arrays", async () => {
        const data = [
            { story: { content: { body: [{ component: "x", items: [{ a: 1 }] }] } } },
        ];
        const p = write("d.json", JSON.stringify(data, null, 2));
        expect(await readJsonArrayStreamed(p)).toEqual(data);
    });

    it("round-trips with writeJsonArrayStreamed", async () => {
        const data = Array.from({ length: 50 }, (_, i) => ({
            id: i,
            full_slug: `stories/${i}`,
            content: { component: "page", body: [{ component: "target", t: `, ] } " ${i}` }] },
        }));
        const p = file("roundtrip.json");
        await writeJsonArrayStreamed(data, p);
        expect(await readJsonArrayStreamed(p)).toEqual(data);
    });

    it("parses correctly across read-stream chunk boundaries (>64KB)", async () => {
        // Default highWaterMark is 64KB; a larger file forces multiple chunks,
        // exercising element/string boundaries that straddle chunks.
        const data = Array.from({ length: 2000 }, (_, i) => ({
            id: i,
            blob: `x`.repeat(80) + `, ] } " ${i}`,
        }));
        const p = file("big.json");
        await writeJsonArrayStreamed(data, p);
        const bytes = fs.statSync(p).size;
        expect(bytes).toBeGreaterThan(64 * 1024);
        expect(await readJsonArrayStreamed(p)).toEqual(data);
    });

    it("rejects a file that is not a JSON array", async () => {
        const p = write("obj.json", JSON.stringify({ not: "an array" }, null, 2));
        await expect(readJsonArrayStreamed(p)).rejects.toThrow(
            "Expected a JSON array",
        );
    });

    it("rejects an empty / non-JSON file", async () => {
        const p = write("empty.json", "   \n  ");
        await expect(readJsonArrayStreamed(p)).rejects.toThrow(
            "Empty or non-JSON file",
        );
    });
});
