import path from "path";

import { remove } from "fs-extra";
import ts from "rollup-plugin-ts";

import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";

import { build } from "./setup-rollup.js";

export const _extractComponentName = (filePath: string): string => {
    const separator = "/"; // this guy is like in unix, becasue what glob is returning is always like that... that's why we are NOT using path.sep here...
    const sP = filePath.split(separator);
    const lastElement = sP[sP.length - 1] as string;

    return lastElement.replaceAll(".ts", "");
};

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

    await Promise.all(
        files.map(async (filePath) => {
            const inputOptions = {
                input: filePath,
                plugins: [
                    ts({
                        transpileOnly: true,
                        transpiler: "swc",
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

    Logger.success("Precompile successfull!.");
};
