import { existsSync } from "fs";
import { pathToFileURL } from "url";

import Logger from "../utils/logger.js";

const toImportSpecifier = (filePath: string): string =>
    process.platform === "win32" ? pathToFileURL(filePath).href : filePath;

export { defaultConfig } from "./defaultConfig.js";
export { SCHEMA } from "./constants.js";

export const getStoryblokConfigWithPath = (data: {
    filePath: string;
    ext: string;
    quiet?: boolean;
}): any => {
    const configSpecifier = toImportSpecifier(`${data.filePath}${data.ext}`);
    const fallbackConfigSpecifier = toImportSpecifier(`${data.filePath}.mjs`);

    return import(/* @vite-ignore */ configSpecifier)
        .then((res) => {
            if (!data.quiet) Logger.success("Found storyblok.config.js!");
            return {
                config: res.default,
                filePath: `${data.filePath}${data.ext}`,
                configError: null,
            };
        })
        .catch((error) => {
            const configError = existsSync(`${data.filePath}${data.ext}`)
                ? `${data.filePath}${data.ext}: ${String(error)}`
                : null;
            if (!data.quiet) {
                Logger.warning(
                    "Cannot find requested file with .js extension.",
                );
                Logger.log("Trying .mjs extension\n");
            }

            return import(/* @vite-ignore */ fallbackConfigSpecifier)
                .then((res) => {
                    if (!data.quiet)
                        Logger.success("Found storyblok.config.mjs!");
                    return {
                        config: res.default,
                        filePath: `${data.filePath}.mjs`,
                        configError,
                    };
                })
                .catch((fallbackError) => {
                    const errors = [configError];
                    if (existsSync(`${data.filePath}.mjs`)) {
                        errors.push(
                            `${data.filePath}.mjs: ${String(fallbackError)}`,
                        );
                    }
                    if (!data.quiet) {
                        Logger.error(
                            "Cannot find requested file with .mjs extension.",
                        );
                        Logger.log(
                            "Create storyblok.config.js or storyblok.config.mjs in your project. If u want to have custom configuration",
                        );

                        Logger.log("Using default configruration.");
                    }
                    return {
                        config: undefined,
                        filePath: null,
                        configError: errors.filter(Boolean).join("\n") || null,
                    };
                });
        });
};

export const getStoryblokConfigContent = async (data: {
    filePath: string;
    ext: string;
}): Promise<any> => (await getStoryblokConfigWithPath(data)).config;
