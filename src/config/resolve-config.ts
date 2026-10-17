import { existsSync } from "fs";
import path from "path";

import dotenv from "dotenv";

import { pkg } from "../utils/pkg.js";

import { defaultConfig, getStoryblokConfigWithPath } from "./helper.js";

/** Resolve config once per caller, retaining the path of the module actually loaded. */
export const resolveConfig = async ({ quiet = false } = {}) => {
    const cwd = process.cwd();
    const envPath = path.resolve(cwd, ".env");
    dotenv.config({ path: envPath, quiet: true });

    const filePath = path.resolve(cwd, "storyblok.config");
    const custom = await getStoryblokConfigWithPath({
        filePath,
        ext: ".js",
        quiet,
    });

    const packagePath = path.resolve(cwd, "package.json");
    const consumerPackage = existsSync(packagePath) ? pkg(packagePath) : {};

    return {
        configError: custom.configError as string | null,
        config: {
            ...defaultConfig(() => consumerPackage, cwd, process.env),
            ...custom.config,
        },
        paths: {
            storyblokConfig: custom.filePath as string | null,
            configCandidates: [`${filePath}.js`, `${filePath}.mjs`],
            env: envPath,
            envExists: existsSync(envPath),
            packageJson: packagePath,
            packageJsonExists: existsSync(packagePath),
        },
    };
};
