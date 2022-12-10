import ts from "rollup-plugin-ts";
import { build } from "./setup-rollup.js";

const _extractComponentName = (filePath: string): string => {
    const sP = filePath.split("/");
    const lastElement = sP[sP.length - 1] as string;

    return lastElement.replaceAll(".ts", "").replaceAll(".sb", "");
};

interface BuildOnTheFly {
    files: string[];
}
export const buildOnTheFly = async ({ files }: BuildOnTheFly) => {
    const projectDir = process.cwd();
    const cacheDir = `${projectDir}/.next/cache/sb-mig`;

    await Promise.all(
        files.map(async (filePath) => {
            const inputOptions = {
                input: filePath,
                plugins: [
                    ts({
                        transpileOnly: true,
                    }),
                ],
            };

            const outputOptionsList = [
                {
                    file: `${cacheDir}/${_extractComponentName(
                        filePath
                    )}.sb.cjs`,
                    format: "cjs",
                },
                {
                    file: `${cacheDir}/${_extractComponentName(
                        filePath
                    )}.sb.js`,
                    format: "es",
                },
            ];

            await build({ inputOptions, outputOptionsList });
        })
    );
};
