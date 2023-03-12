import ts from "rollup-plugin-ts";
import { build } from "./setup-rollup.js";
import Logger from "../utils/logger.js";
import storyblokConfig from "../config/config.js";
import { remove } from "fs-extra";
import path from "path";

export const _extractComponentName = (filePath: string): string => {
    const separator = "/"; // this guy is like in unix, becasue what glob is returning is always like that... that's why we are NOT using path.sep here...
    const sP = filePath.split(separator);
    const lastElement = sP[sP.length - 1] as string;

    return lastElement.replaceAll(".ts", "").replaceAll(".sb", "");
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
        `sb-mig`
    );

    console.log("This is cacheDir: ", cacheDir);
    console.log("these are files: ");
    console.log(files);

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
                        `${_extractComponentName(filePath)}.sb.cjs`
                    ),
                    format: "cjs",
                },
                {
                    file: path.join(
                        `${cacheDir}`,
                        `${_extractComponentName(filePath)}.sb.js`
                    ),
                    format: "es",
                },
            ];

            await build({ inputOptions, outputOptionsList });
        })
    );

    Logger.success("Precompile successfull!.");
};
