import { spawn, spawnSync } from "child_process";
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * MAR-4104: the built CLI, run the way an agent runs it — no terminal,
 * `--json` — against the fixture project in `__tests__/fixtures/agent-project`.
 * Its storyblok.config plugs in a fake Storyblok (`fake-storyblok.mjs`), so
 * nothing here touches the network.
 */

const cliPath = path.resolve(process.cwd(), "dist/cli/index.js");
const fixture = path.resolve(process.cwd(), "__tests__/fixtures/agent-project");

let projectDir: string;

const env = (extra: Record<string, string> = {}) => ({
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    STORYBLOK_OAUTH_TOKEN: "",
    STORYBLOK_SPACE_ID: "",
    SBMIG_FAKE_STATE: path.join(projectDir, "state.json"),
    SBMIG_FAKE_WRITES: path.join(projectDir, "writes.log"),
    ...extra,
});

const runCli = (args: string[], extraEnv: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
        cwd: projectDir,
        encoding: "utf8",
        // stdin is a closed pipe: no terminal, as under an agent.
        input: "",
        env: env(extraEnv),
        timeout: 60_000,
    });

    return {
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
    };
};

const writes = () => {
    const file = path.join(projectDir, "writes.log");
    return existsSync(file)
        ? readFileSync(file, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line))
        : [];
};

describe("sb-mig as an agent runs it", () => {
    beforeAll(() => {
        if (!existsSync(cliPath)) {
            throw new Error(
                `CLI not built. Run 'npm run build' before agent-sync tests. Expected: ${cliPath}`,
            );
        }
    });

    beforeEach(() => {
        projectDir = mkdtempSync(path.join(tmpdir(), "sb-mig-agent-"));
        cpSync(fixture, projectDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true });
    });

    it("sync components --all --dry-run --json: one document on stdout, the plan, no writes", () => {
        const result = runCli([
            "sync",
            "components",
            "--all",
            "--dry-run",
            "--json",
        ]);

        expect(result.exitCode).toBe(0);
        // stdout is the document and nothing else; the logs are on stderr.
        const report = JSON.parse(result.stdout);
        expect(result.stderr).toContain("Trying to get all components.");

        expect(report).toMatchObject({
            ok: true,
            command: "sync components",
            dryRun: true,
            errors: [],
        });
        expect(
            Object.fromEntries(
                report.components.map((c: any) => [c.name, c.action]),
            ),
        ).toEqual({ hero: "update", card: "unchanged", promo: "create" });

        const hero = report.components.find((c: any) => c.name === "hero");
        // `promo` is added by the resolver in the fixture's storyblok.config.
        expect(hero.whitelist).toEqual([
            {
                field: "items",
                added: ["promo"],
                removed: ["banner"],
                restricted: { from: true, to: true },
            },
        ]);
        expect(report.destructive.map((d: any) => d.kind)).toEqual([
            "likely-rename",
            "whitelist-narrowed",
        ]);
        expect(writes()).toEqual([]);
    });

    it("sync components --all --json: exits 1 when one of three writes fails, after all three", () => {
        const result = runCli(["sync", "components", "--all", "--json"], {
            SBMIG_FAKE_FAIL: "card",
        });

        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.ok).toBe(false);
        expect(
            Object.fromEntries(
                report.components.map((c: any) => [c.name, c.status]),
            ),
        ).toEqual({ hero: "written", card: "failed", promo: "written" });
        expect(report.errors).toEqual([
            {
                scope: "component",
                name: "card",
                message: expect.stringContaining("status: 422"),
            },
        ]);
        expect(
            writes()
                .filter((w) => w.path.includes("/components"))
                .map((w) => `${w.method} ${w.body.component.name}`),
        ).toEqual(["PUT hero", "PUT card", "POST promo"]);
    });

    it("sync datasources --all --dry-run --json: entries planned, nothing written", () => {
        const result = runCli([
            "sync",
            "datasources",
            "--all",
            "--dry-run",
            "--json",
        ]);

        expect(result.exitCode).toBe(0);
        const report = JSON.parse(result.stdout);
        const colors = report.datasources.find((d: any) => d.name === "colors");

        expect(colors).toMatchObject({
            action: "update",
            entries: [
                {
                    name: "red",
                    action: "update",
                    value: { from: "#f00", to: "#ff0000" },
                },
                { name: "green", action: "create" },
            ],
            unchangedEntries: 1,
        });
        expect(writes()).toEqual([]);
    });

    it("sync components --ssot without --yes fails fast instead of waiting on stdin", async () => {
        // stdin stays open and silent, the way an agent's pipe does.
        const child = spawn(
            process.execPath,
            [cliPath, "sync", "components", "--all", "--ssot", "--json"],
            { cwd: projectDir, env: env(), stdio: ["pipe", "pipe", "pipe"] },
        );
        let stdout = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));

        const exitCode = await new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => {
                child.kill();
                resolve(null);
            }, 20_000);
            child.on("exit", (code) => {
                clearTimeout(timer);
                resolve(code);
            });
        });
        child.stdin.end();

        expect(exitCode).toBe(1);
        const report = JSON.parse(stdout);
        expect(report.errors[0].message).toContain("--yes");
        expect(writes()).toEqual([]);
    }, 30_000);

    it("a write whose connection drops is a failure, not a success", () => {
        const result = runCli(["sync", "components", "--all", "--json"], {
            SBMIG_FAKE_FAULTS: JSON.stringify({ "PUT card": "network" }),
        });

        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.ok).toBe(false);
        expect(
            report.components.find((c: any) => c.name === "card").status,
        ).toBe("failed");
        expect(report.errors).toEqual([
            expect.objectContaining({
                scope: "component",
                name: "card",
                message: expect.stringContaining("ECONNRESET"),
            }),
        ]);
    });

    it("--ssot --yes with no schema files found refuses, and deletes nothing", () => {
        rmSync(path.join(projectDir, "src/components"), {
            recursive: true,
            force: true,
        });

        const result = runCli([
            "sync",
            "components",
            "--all",
            "--ssot",
            "--yes",
            "--json",
        ]);

        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.ok).toBe(false);
        expect(report.errors[0].message).toContain(
            "Refusing --ssot: no component schema files were found",
        );
        expect(writes()).toEqual([]);
    });

    it("an unknown flag for the subcommand exits 1 and writes nothing", () => {
        const result = runCli([
            "sync",
            "components",
            "--all",
            "--to=999999",
            "--json",
        ]);

        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout).errors[0].message).toContain("--to");
        expect(writes()).toEqual([]);
    });

    it("a datasource listing that answers 404 exits 1 instead of planning everything as new", () => {
        const result = runCli(
            ["sync", "datasources", "--all", "--dry-run", "--json"],
            { SBMIG_FAKE_FAULTS: JSON.stringify({ "GET datasources": "404" }) },
        );

        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.ok).toBe(false);
        expect(report.datasources).toEqual([]);
    });

    it("--package-name: an unknown package exits 1, a known one is planned", () => {
        const kit = path.join(projectDir, "src/packages/ui-kit");
        mkdirSync(kit, { recursive: true });
        writeFileSync(
            path.join(kit, "package.json"),
            JSON.stringify({ name: "ui-kit", type: "module" }),
        );
        writeFileSync(
            path.join(kit, "badge.sb.js"),
            'export default { name: "badge", schema: { label: { type: "text" } } };\n',
        );

        const missing = runCli([
            "sync",
            "components",
            "missing-package",
            "--package-name",
            "--dry-run",
            "--json",
        ]);
        const known = runCli([
            "sync",
            "components",
            "ui-kit",
            "--package-name",
            "--dry-run",
            "--json",
        ]);

        expect(missing.exitCode).toBe(1);
        expect(JSON.parse(missing.stdout).errors).toEqual([
            {
                scope: "component",
                name: "missing-package",
                message:
                    "No package named 'missing-package' was found in componentsDirectories.",
            },
        ]);
        expect(known.exitCode).toBe(0);
        expect(
            JSON.parse(known.stdout).components.map((c: any) => [
                c.name,
                c.action,
            ]),
        ).toEqual([["badge", "create"]]);
    });
});
