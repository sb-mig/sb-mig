import { pathToFileURL } from "url";

import Logger from "../utils/logger.js";

const toImportSpecifier = (filePath: string): string =>
    process.platform === "win32" ? pathToFileURL(filePath).href : filePath;

export { defaultConfig } from "./defaultConfig.js";
export { SCHEMA } from "./constants.js";

export const getStoryblokConfigContent = (data: {
    filePath: string;
    ext: string;
}): any => {
    const configSpecifier = toImportSpecifier(`${data.filePath}${data.ext}`);
    const fallbackConfigSpecifier = toImportSpecifier(`${data.filePath}.mjs`);

    return import(/* @vite-ignore */ configSpecifier)
        .then((res) => {
            Logger.success("Found storyblok.config.js!");
            return res.default;
        })
        .catch(() => {
            Logger.warning("Cannot find requested file with .js extension.");
            Logger.log("Trying .mjs extension\n");

            return import(/* @vite-ignore */ fallbackConfigSpecifier)
                .then((res) => {
                    Logger.success("Found storyblok.config.mjs!");
                    return res.default;
                })
                .catch(() => {
                    Logger.error(
                        "Cannot find requested file with .mjs extension.",
                    );
                    Logger.log(
                        "Create storyblok.config.js or storyblok.config.mjs in your project. If u want to have custom configuration",
                    );

                    Logger.log("Using default configruration.");
                });
        });
};
