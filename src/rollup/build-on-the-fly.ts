import type { Plugin } from "rollup";

import { existsSync, statSync } from "fs";
import path from "path";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import rollupSwc from "@rollup/plugin-swc";
import { remove } from "fs-extra";
import ts from "typescript";

import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";
import { extractComponentName } from "../utils/path-utils.js";

import { build } from "./setup-rollup.js";

// Re-export for backward compatibility
export const _extractComponentName = extractComponentName;

const RESOLVE_EXTENSIONS = [".mjs", ".js", ".cjs", ".ts", ".tsx", ".json"];

const getExistingFile = (filePath: string): string | null => {
    const candidates = [
        filePath,
        ...RESOLVE_EXTENSIONS.map((extension) => `${filePath}${extension}`),
        ...RESOLVE_EXTENSIONS.map((extension) =>
            path.join(filePath, `index${extension}`),
        ),
    ];

    for (const candidate of candidates) {
        try {
            if (existsSync(candidate) && statSync(candidate).isFile()) {
                return candidate;
            }
        } catch {
            // Ignore inaccessible candidates and continue resolving.
        }
    }

    return null;
};

const getTsconfigCompilerOptions = (projectDir: string) => {
    const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists);

    if (!configPath) {
        return null;
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

    if (configFile.error) {
        return null;
    }

    const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath),
    );

    return parsed.options;
};

const matchTsconfigPathPattern = (source: string, pattern: string) => {
    const wildcardIndex = pattern.indexOf("*");

    if (wildcardIndex === -1) {
        return source === pattern ? "" : null;
    }

    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);

    if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
        return null;
    }

    return source.slice(prefix.length, source.length - suffix.length);
};

const createTsconfigPathsResolver = (projectDir: string): Plugin => {
    const compilerOptions = getTsconfigCompilerOptions(projectDir);
    const paths = compilerOptions?.paths;
    const baseUrl = compilerOptions?.baseUrl ?? projectDir;

    return {
        name: "sb-mig-tsconfig-paths",
        resolveId(source) {
            if (!paths) {
                return null;
            }

            for (const [pattern, replacements] of Object.entries(paths)) {
                const wildcardValue = matchTsconfigPathPattern(source, pattern);

                if (wildcardValue === null) {
                    continue;
                }

                for (const replacement of replacements) {
                    const candidate = path.resolve(
                        baseUrl,
                        replacement.replace("*", wildcardValue),
                    );
                    const existingFile = getExistingFile(candidate);

                    if (existingFile) {
                        return existingFile;
                    }
                }
            }

            return null;
        },
    };
};

interface BuildOnTheFly {
    files: string[];
    projectDir?: string;
}
export const buildOnTheFly = async ({
    files,
    projectDir = process.cwd(),
}: BuildOnTheFly) => {
    if (storyblokConfig.flushCache) {
        await remove(path.join(`${storyblokConfig.cacheDir}`, `sb-mig`));
    }

    const cacheDir = path.join(
        `${projectDir}`,
        `${storyblokConfig.cacheDir}`,
        `sb-mig`,
    );

    const BATCH_SIZE = 5;
    const total = files.length;

    Logger.log(`Compiling ${total} schema files...`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchEnd = Math.min(i + BATCH_SIZE, total);

        Logger.log(`[${i + 1}-${batchEnd}/${total}] Compiling batch...`);

        await Promise.all(
            batch.map(async (filePath) => {
                const inputOptions = {
                    input: filePath,
                    plugins: [
                        createTsconfigPathsResolver(projectDir),
                        nodeResolve({
                            extensions: RESOLVE_EXTENSIONS,
                            preferBuiltins: true,
                        }),
                        rollupSwc({
                            swc: {
                                jsc: {
                                    parser: {
                                        syntax: "typescript",
                                    },
                                },
                            },
                        }),
                    ],
                };

                const outputOptionsList = [
                    {
                        file: path.join(
                            `${cacheDir}`,
                            `${_extractComponentName(filePath)}.cjs`,
                        ),
                        format: "cjs",
                    },
                    {
                        file: path.join(
                            `${cacheDir}`,
                            `${_extractComponentName(filePath)}.js`,
                        ),
                        format: "es",
                    },
                ];

                await build({ inputOptions, outputOptionsList });
            }),
        );
    }

    Logger.success(`Precompile successful! (${total} files)`);
};
