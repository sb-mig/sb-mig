import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
    createDir,
    readFile,
    toImportSpecifier,
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
});
