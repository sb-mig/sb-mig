import { spawnSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { inspect } from "util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = path.resolve("dist/cli/index.js");
const secrets = {
    STORYBLOK_OAUTH_TOKEN: "Q7m9L2x8N4v6Zx81",
    OPENAI_API_KEY: "R8n2K5w9M3z7Jq62",
    OTHER_PASSWORD: "S9p3H6y2B4k8Vm43",
    DOTENV_SECRET: "T2q4G7z3C5m9Rs24",
    config: "U3r5F8a4D6n2Tu95",
    query: "Y6t8B3f5G7h9Wk42",
    username: "Z7u9C4g6H8j2Xp53",
    password: "A8v2D5h7J9k3Yq64",
    encoded: "B9w3/E6+j8@K2m4Zr75",
    proxy: "FakeProxyPass55",
};
let project: string;
const run = (json: boolean, env: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(
        process.execPath,
        [cliPath, "debug", ...(json ? ["--json"] : [])],
        {
            cwd: project,
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NO_COLOR: "1",
                STORYBLOK_OAUTH_TOKEN: secrets.STORYBLOK_OAUTH_TOKEN,
                OPENAI_API_KEY: secrets.OPENAI_API_KEY,
                OTHER_PASSWORD: secrets.OTHER_PASSWORD,
                ENCODED_SECRET: secrets.encoded,
                CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: "1",
                TOKENIZERS_PARALLELISM: "false",
                ...env,
            },
        },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    // Every five-character window is absent: this rules out any leak >4 chars.
    for (const secret of Object.values(secrets).flatMap((secret) => [
        secret,
        encodeURIComponent(secret),
    ])) {
        for (let i = 0; i <= secret.length - 5; i++) {
            expect(result.stdout + result.stderr).not.toContain(
                secret.slice(i, i + 5),
            );
        }
    }
    return result.stdout;
};

beforeEach(() => {
    project = realpathSync.native(
        mkdtempSync(path.join(tmpdir(), "sb-mig-debug-")),
    );
    writeFileSync(
        path.join(project, "package.json"),
        JSON.stringify({ type: "module" }),
    );
    writeFileSync(
        path.join(project, ".env"),
        `DOTENV_SECRET=${secrets.DOTENV_SECRET}\n`,
    );
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

describe("debug CLI", () => {
    it.each([false, true])(
        "masks secrets throughout the report (json=%s)",
        (json) => {
            writeFileSync(
                path.join(project, "storyblok.config.mjs"),
                `export default {
            nested: {
                apiKey: '${secrets.config}',
                alias: process.env.STORYBLOK_OAUTH_TOKEN,
                entries: [process.env.OTHER_PASSWORD, { value: process.env.OPENAI_API_KEY }],
                description: 'Bearer ' + process.env.DOTENV_SECRET,
                auth: { header: '${secrets.config}' },
                emptyToken: '',
                shortSecret: 'xyz',
                numericPassword: 987654321,
                flag: true,
                queryUrl: 'https://example.test/?access_token=${secrets.query}&page=2',
                credentialsUrl: 'https://${secrets.username}:${secrets.password}@example.test/path',
                encodedUrl: 'https://example.test/?value=' + encodeURIComponent(process.env.ENCODED_SECRET),
                encodedAlias: encodeURIComponent(process.env.ENCODED_SECRET),
                simulatedNodeVersion: 'v24.17.0',
                ordinaryNumber: 1
            }
        };`,
            );
            const output = run(json);
            expect(output).toContain("••••Zx81");
            expect(output).toContain("••••Jq62");
            expect(output).toContain("••••Vm43");
            expect(output).toContain("••••Rs24");
            expect(output).toContain("••••Tu95");
            expect(output).not.toContain("987654321");
            expect(output).not.toContain("xyz");
            if (json) {
                const report = JSON.parse(output);
                expect(report.paths.storyblokConfig).toBe(
                    path.join(project, "storyblok.config.mjs"),
                );
                expect(report.nodeVersion).toBe(process.version);
                expect(report.config.debug).toBe(false);
                expect(report.config.metadataSelection.author).toBe(true);
                expect(report.config.nested.simulatedNodeVersion).toBe(
                    "v24.17.0",
                );
                expect(report.config.nested.ordinaryNumber).toBe(1);
                expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
            }
            expect(normalizeSnapshot(output, project)).toMatchSnapshot();
        },
    );

    it("reports defaults without a config file or package.json", () => {
        rmSync(path.join(project, "package.json"));
        rmSync(path.join(project, ".env"));
        const report = JSON.parse(run(true));
        expect(report.paths.storyblokConfig).toBeNull();
        expect(report.configError).toBeNull();
        expect(report.paths.envExists).toBe(false);
        expect(report.paths.packageJsonExists).toBe(false);
        expect(report.paths.configCandidates).toEqual([
            path.join(project, "storyblok.config.js"),
            path.join(project, "storyblok.config.mjs"),
        ]);
        expect(report.moduleType).toBe("commonjs");
        expect(report.dependencies["@ef-global/backpack"]).toBeNull();
    });

    it("reports the .js file actually loaded ahead of .mjs", () => {
        writeFileSync(
            path.join(project, "storyblok.config.js"),
            "export default { rateLimit: 9 };",
        );
        writeFileSync(
            path.join(project, "storyblok.config.mjs"),
            "export default { rateLimit: 7 };",
        );
        const report = JSON.parse(run(true));
        expect(report.paths.storyblokConfig).toBe(
            path.join(project, "storyblok.config.js"),
        );
        expect(report.config.rateLimit).toBe(9);
        expect(report.paths.envExists).toBe(true);
        expect(report.paths.packageJsonExists).toBe(true);
    });
});

// Replace escaped paths first: both JSON and inspect escape Windows backslashes.
const normalizeSnapshot = (output: string, projectPath: string) =>
    output
        .split(JSON.stringify(projectPath).slice(1, -1))
        .join("<project>")
        .split(projectPath)
        .join("<project>")
        .replace(/\\+/g, "/")
        .replace(/v\d+\.\d+\.\d+/g, "<node-version>")
        .replace(/\b\d+\.\d+\.\d+(?:-beta\.\d+)?/g, "<version>");

it.each([false, true])(
    "normalizes escaped Windows paths for snapshots (json=%s)",
    (json) => {
        const windowsProject = String.raw`C:\Users\RUNNER~1\Temp\sb-mig-debug-123`;
        const render = json
            ? JSON.stringify
            : (value: unknown) => inspect(value, { breakLength: Infinity });
        expect(
            normalizeSnapshot(
                render({ file: `${windowsProject}\\storyblok.config.mjs` }),
                windowsProject,
            ),
        ).toBe(
            normalizeSnapshot(
                render({ file: "/tmp/project/storyblok.config.mjs" }),
                "/tmp/project",
            ),
        );
    },
);

it.each([false, true])(
    "masks proxy credentials with no config file (json=%s)",
    (json) => {
        const output = run(json, {
            NEXT_PUBLIC_STORYBLOK_MANAGEMENT_API_URL: `https://svc:${secrets.proxy}@example.test/v1`,
        });
        expect(output).toContain("https://••••:••••ss55@example.test/v1");
    },
);

it("reports syntax errors instead of silently showing defaults", () => {
    writeFileSync(
        path.join(project, "storyblok.config.mjs"),
        "export default { broken: ;",
    );
    const report = JSON.parse(run(true));
    expect(report.paths.storyblokConfig).toBeNull();
    expect(report.configError).toContain("storyblok.config.mjs: SyntaxError:");
});

it.each([false, true])("masks config loading errors (json=%s)", (json) => {
    writeFileSync(
        path.join(project, "storyblok.config.js"),
        `throw new Error('https://${secrets.username}:${secrets.password}@example.test/?access_token=${secrets.query} ' + process.env.ENCODED_SECRET);`,
    );
    // A broken .js file still falls back to .mjs, while retaining the diagnostic.
    writeFileSync(
        path.join(project, "storyblok.config.mjs"),
        "export default { rateLimit: 7 };",
    );
    const output = run(json);
    expect(output).toContain(
        "Error: https://••••Xp53:••••Yq64@example.test/?access_token=••••Wk42",
    );
    if (json) {
        const report = JSON.parse(output);
        expect(report.paths.storyblokConfig).toBe(
            path.join(project, "storyblok.config.mjs"),
        );
        expect(report.config.rateLimit).toBe(7);
        expect(report.configError).toContain("storyblok.config.js:");
    }
});
