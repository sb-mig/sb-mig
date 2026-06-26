import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
    createAndSaveToFile,
    createDir,
    readFile,
    toImportSpecifier,
    writeJsonArrayStreamed,
} from "../../src/utils/files.js";

describe("files utilities", () => {
    const tempDirs: string[] = [];

    const makeTempDir = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-mig-files-"));
        tempDirs.push(dir);
        return dir;
    };

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("converts Windows absolute paths to importable file URLs", () => {
        const specifier = toImportSpecifier(
            "C:\\Users\\Runner Admin\\project\\config with spaces.mjs",
            "win32",
        );

        expect(specifier).toBe(
            "file:///C:/Users/Runner%20Admin/project/config%20with%20spaces.mjs",
        );
    });

    it("creates absolute directories without prefixing process.cwd()", async () => {
        const tempDir = makeTempDir();
        const targetDir = path.join(tempDir, "absolute", "nested");

        await createDir(targetDir);

        expect(fs.existsSync(targetDir)).toBe(true);
    });

    it("reads absolute paths without prefixing process.cwd()", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "data.json");
        fs.writeFileSync(filePath, '{"ok":true}\n');

        await expect(readFile(filePath)).resolves.toBe('{"ok":true}\n');
    });

    it("streams an array as JSON identical to JSON.stringify(arr, null, 2)", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "out.json");
        const arr = [
            { id: 1, name: "first", nested: { a: [1, 2, 3], b: "x" } },
            { id: 2, name: "second", tags: ["p", "q"] },
            { id: 3, name: "third", nested: { deep: { deeper: true } } },
        ];

        await writeJsonArrayStreamed(arr, filePath);

        const written = fs.readFileSync(filePath, "utf8");
        expect(written).toBe(JSON.stringify(arr, null, 2));
    });

    it("streams an empty array as []", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "empty.json");

        await writeJsonArrayStreamed([], filePath);

        expect(fs.readFileSync(filePath, "utf8")).toBe("[]");
    });

    it("streams a single-element array identically to JSON.stringify", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "single.json");
        const arr = [{ only: { nested: "value" } }];

        await writeJsonArrayStreamed(arr, filePath);

        expect(fs.readFileSync(filePath, "utf8")).toBe(
            JSON.stringify(arr, null, 2),
        );
    });

    it("serializes undefined elements as null, matching JSON.stringify", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "holes.json");
        const arr = [{ a: 1 }, undefined, { b: 2 }];

        await writeJsonArrayStreamed(arr, filePath);

        expect(fs.readFileSync(filePath, "utf8")).toBe(
            JSON.stringify(arr, null, 2),
        );
    });

    it("round-trips a moderately large array via JSON.parse", async () => {
        const tempDir = makeTempDir();
        const filePath = path.join(tempDir, "large.json");
        const arr = Array.from({ length: 5000 }, (_, i) => ({
            id: i,
            payload: `item-${i}`.repeat(20),
            meta: { index: i, even: i % 2 === 0 },
        }));

        await writeJsonArrayStreamed(arr, filePath);

        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        expect(parsed).toHaveLength(5000);
        expect(parsed[0]).toEqual(arr[0]);
        expect(parsed[4999]).toEqual(arr[4999]);
    });

    it("createAndSaveToFile writes array res matching canonical JSON", async () => {
        const tempDir = makeTempDir();
        const arr = [
            { story: { id: 1, name: "alpha" } },
            { story: { id: 2, name: "beta" } },
        ];

        await createAndSaveToFile(
            {
                ext: "json",
                filename: "story-input-full",
                folder: "migrations",
                res: arr,
            },
            { sbmigWorkingDirectory: tempDir } as any,
        );

        const filePath = path.join(
            tempDir,
            "migrations",
            "story-input-full.json",
        );
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, "utf8")).toBe(
            JSON.stringify(arr, null, 2),
        );
    });

    it("createAndSaveToFile writes non-array res via JSON.stringify", async () => {
        const tempDir = makeTempDir();
        const summary = { totalItems: 3, steps: ["a", "b"] };

        await createAndSaveToFile(
            {
                ext: "json",
                filename: "summary",
                folder: "migrations",
                res: summary,
            },
            { sbmigWorkingDirectory: tempDir } as any,
        );

        const filePath = path.join(tempDir, "migrations", "summary.json");
        expect(fs.readFileSync(filePath, "utf8")).toBe(
            JSON.stringify(summary, undefined, 2),
        );
    });
});
