import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { createDir, getFileContent, readFile } from "../../src/utils/files.js";

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

    it("loads an absolute module path via a file URL compatible import", async () => {
        const tempDir = makeTempDir();
        const modulePath = path.join(tempDir, "config with spaces.mjs");
        fs.writeFileSync(
            modulePath,
            "export default { componentsDirectories: ['src'] };\n",
        );

        await expect(getFileContent({ file: modulePath })).resolves.toEqual({
            componentsDirectories: ["src"],
        });
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
