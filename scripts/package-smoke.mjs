#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const run = (command, args, options = {}) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            env: {
                ...process.env,
                FORCE_COLOR: "0",
                ...options.env,
            },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }

            reject(
                new Error(
                    [
                        `Command failed (${code}): ${command} ${args.join(" ")}`,
                        stdout.trim(),
                        stderr.trim(),
                    ]
                        .filter(Boolean)
                        .join("\n"),
                ),
            );
        });
    });

const findTarball = async () => {
    const explicitPath = process.env.SB_MIG_TARBALL || process.argv[2];

    if (explicitPath) {
        const resolved = path.resolve(explicitPath);

        if (!existsSync(resolved)) {
            throw new Error(`Tarball does not exist: ${resolved}`);
        }

        return resolved;
    }

    const files = await readdir(process.cwd());
    const tarballs = files.filter((file) => /^sb-mig-.*\.tgz$/.test(file));

    if (tarballs.length !== 1) {
        throw new Error(
            `Expected exactly one sb-mig tarball in ${process.cwd()}, found ${tarballs.length}`,
        );
    }

    return path.resolve(tarballs[0]);
};

const writeSmokeProject = async (projectDir) => {
    await writeFile(
        path.join(projectDir, "package.json"),
        JSON.stringify(
            {
                name: "sb-mig-package-smoke",
                private: true,
                type: "module",
            },
            null,
            2,
        ),
    );

    await writeFile(
        path.join(projectDir, "storyblok.config.mjs"),
        [
            "export default {",
            '    componentsDirectories: ["src/components"],',
            '    schemaFileExt: "sb.js",',
            '    sbmigWorkingDirectory: "sbmig",',
            "    rateLimit: 1,",
            "};",
            "",
        ].join("\n"),
    );

    const componentsDir = path.join(projectDir, "src", "components");
    await mkdir(componentsDir, { recursive: true });

    await writeFile(
        path.join(componentsDir, "hero.sb.js"),
        [
            "export default {",
            '    name: "hero",',
            '    display_name: "Hero",',
            "    is_root: false,",
            "    is_nestable: true,",
            "    schema: {",
            "        title: {",
            '            type: "text",',
            "        },",
            "    },",
            "};",
            "",
        ].join("\n"),
    );
};

const main = async () => {
    const tarball = await findTarball();
    const projectDir = await mkdtemp(path.join(tmpdir(), "sb-mig-smoke-"));
    const keepProject = process.env.KEEP_SMOKE_DIR === "1";

    try {
        await writeSmokeProject(projectDir);
        const npmEnv = {
            npm_config_cache: path.join(projectDir, ".npm-cache"),
            npm_config_update_notifier: "false",
        };

        await run(
            npmCommand,
            ["install", "--no-audit", "--no-fund", "--ignore-scripts", tarball],
            { cwd: projectDir, env: npmEnv },
        );

        const help = await run(npmCommand, ["exec", "--", "sb-mig", "--help"], {
            cwd: projectDir,
            env: npmEnv,
        });

        if (!help.stdout.includes("USAGE") || !help.stdout.includes("sync")) {
            throw new Error(`Unexpected sb-mig help output:\n${help.stdout}`);
        }

        await run(
            process.execPath,
            [
                "-e",
                "const api = require('sb-mig/api-v2'); if (typeof api.createClient !== 'function') throw new Error('api-v2 CJS export failed');",
            ],
            { cwd: projectDir, env: npmEnv },
        );

        await run(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                "const api = await import('sb-mig/api-v2'); if (typeof api.createClient !== 'function') throw new Error('api-v2 ESM export failed');",
            ],
            { cwd: projectDir, env: npmEnv },
        );

        const discover = await run(
            npmCommand,
            ["exec", "--", "sb-mig", "discover", "components", "--all"],
            { cwd: projectDir, env: npmEnv },
        );

        if (!discover.stdout.includes("hero")) {
            throw new Error(
                `Expected discover output to include the hero component:\n${discover.stdout}`,
            );
        }

        console.log(`Package smoke test passed: ${path.basename(tarball)}`);
    } finally {
        if (!keepProject) {
            await rm(projectDir, { recursive: true, force: true });
        } else {
            console.log(`Kept smoke project at ${projectDir}`);
        }
    }
};

await main();
