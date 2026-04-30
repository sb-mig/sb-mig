import path from "path";

import rollupSwc from "@rollup/plugin-swc";
import { remove } from "fs-extra";

import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";
import { extractComponentName } from "../utils/path-utils.js";

import { build } from "./setup-rollup.js";

// Re-export for backward compatibility
export const _extractComponentName = extractComponentName;

interface BuildOnTheFly {
    files: string[];
}
export const buildOnTheFly = async ({ files }: BuildOnTheFly) => {
    if (storyblokConfig.flushCache) {
        await remove(path.join(`${storyblokConfig.cacheDir}`, `sb-mig`));
    }

    const projectDir = process.cwd();
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
