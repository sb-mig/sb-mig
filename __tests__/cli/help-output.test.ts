import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist/cli/index.js");
const publicCommands = [
    "sync",
    "copy",
    "discover",
    "backup",
    "migrate",
    "language-publish-state",
    "story-versions",
    "published-layer-export",
    "remove",
    "revert",
    "migrations",
    "init",
    "debug",
];

let tempProjectDir: string;

const runCli = (args: string[]) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
        cwd: tempProjectDir,
        encoding: "utf8",
        env: {
            ...process.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
        },
    });

    return {
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
    };
};

describe("CLI help output", () => {
    beforeAll(() => {
        if (!existsSync(cliPath)) {
            throw new Error(
                `CLI not built. Run 'npm run build' before help-output tests. Expected: ${cliPath}`,
            );
        }

        tempProjectDir = mkdtempSync(path.join(tmpdir(), "sb-mig-help-"));
    });

    afterAll(() => {
        if (tempProjectDir) {
            rmSync(tempProjectDir, { recursive: true, force: true });
        }
    });

    it("prints clean top-level help and exits successfully", () => {
        const result = runCli(["--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("USAGE");
        expect(result.stdout).toContain("$ sb-mig [command]");
        expect(result.stdout).not.toContain("dotenv");
        expect(result.stdout).not.toContain("storyblok.config");
        expect(result.stdout).not.toContain("Cannot find requested file");

        for (const command of publicCommands) {
            expect(result.stdout).toContain(command);
        }

        expect(result.stdout).not.toContain("test ");
    });

    it("prints clean help-command output and exits successfully", () => {
        const result = runCli(["help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("USAGE");
        expect(result.stdout).not.toContain("dotenv");
        expect(result.stdout).not.toContain("storyblok.config");
    });

    it.each(publicCommands)(
        "prints %s help and exits successfully",
        (command) => {
            const result = runCli([command, "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("USAGE");
            expect(result.stdout).not.toContain("dotenv");
            expect(result.stdout).not.toContain("storyblok.config");
            expect(result.stdout).not.toContain("Cannot find requested file");
        },
    );

    it("documents high-risk command gotchas", () => {
        const migrateHelp = runCli(["migrate", "--help"]).stdout;
        const copyHelp = runCli(["copy", "--help"]).stdout;
        const syncHelp = runCli(["sync", "--help"]).stdout;
        const removeHelp = runCli(["remove", "--help"]).stdout;
        const revertHelp = runCli(["revert", "--help"]).stdout;

        expect(migrateHelp).toContain("preserve-layers");
        expect(migrateHelp).toContain("same Storyblok space");
        expect(migrateHelp).toContain("migrate presets");
        expect(migrateHelp).toContain("--publish");

        expect(copyHelp).toContain("copy stories");
        expect(copyHelp).toContain("copy assets");
        expect(copyHelp).toContain("--source");
        expect(copyHelp).toContain("--destination");
        expect(copyHelp).toContain("--mode");
        expect(copyHelp).toContain("--all");
        expect(copyHelp).toContain("--dry-run");
        expect(copyHelp).toContain("--outputPath");
        expect(copyHelp).toContain("folder/*");
        expect(copyHelp).toContain("Apply mode is not implemented yet");
        expect(copyHelp).toContain("Alias for --from");
        expect(copyHelp).not.toContain("?");

        expect(syncHelp).toContain("--syncDirection");
        expect(syncHelp).toContain("--ssot");
        expect(syncHelp).toContain("fromAWSToSpace");

        expect(removeHelp).toContain("story --all --from");
        expect(removeHelp).toContain("destructive");
        expect(removeHelp).toContain("no-op");

        expect(revertHelp).toContain("--from");
        expect(revertHelp).toContain("--to");
        expect(revertHelp).not.toContain("--migration");
        expect(revertHelp).not.toContain("???");
    });
});
