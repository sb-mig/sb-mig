import { existsSync } from "fs";
import { pathToFileURL } from "url";

import Logger from "../utils/logger.js";

const toImportSpecifier = (filePath: string): string =>
    process.platform === "win32" ? pathToFileURL(filePath).href : filePath;

// Error messages can contain source code, including credentials that never loaded.
// Keep only a standard error name and the config frame's numeric position.
const configErrorSummary = (error: unknown, filePath: string): string => {
    const names = [
        "Error",
        "EvalError",
        "RangeError",
        "ReferenceError",
        "SyntaxError",
        "TypeError",
        "URIError",
        "AggregateError",
    ];
    const name =
        error instanceof Error && names.includes(error.name)
            ? error.name
            : "Error";
    const frame =
        error instanceof Error
            ? error.stack
                  ?.split("\n")
                  .slice(1)
                  .find(
                      (line) =>
                          line.trimStart().startsWith("at ") &&
                          (line.includes(`${pathToFileURL(filePath).href}:`) ||
                              line.includes(`${filePath}:`)),
                  )
            : undefined;
    const position = frame?.match(/:(\d+):(\d+)\)?$/);
    return `${name}${position ? ` at ${position[1]}:${position[2]}` : ""}`;
};

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
                ? configErrorSummary(error, `${data.filePath}${data.ext}`)
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
                            configErrorSummary(
                                fallbackError,
                                `${data.filePath}.mjs`,
                            ),
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
