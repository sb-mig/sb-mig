import Logger from "../utils/logger.js";

export { defaultConfig } from "./defaultConfig.js";
export { SCHEMA } from "./constants.js";

export const getStoryblokConfigContent = (data: {
    filePath: string;
    ext: string;
}): any => {
    let prefix = "";

    if (process.platform === "win32") {
        prefix = "file://";
    }
    return import(`${prefix}${data.filePath}${data.ext}`)
        .then((res) => {
            Logger.success("Found storyblok.config.js!");
            return res.default;
        })
        .catch(() => {
            Logger.warning("Cannot find requested file with .js extension.");
            Logger.log("Trying .mjs extension\n");

            return import(`${prefix}${data.filePath}.mjs`)
                .then((res) => {
                    Logger.success("Found storyblok.config.mjs!");
                    console.log("res", res);
                    return res.default;
                })
                .catch(() => {
                    Logger.error(
                        "Cannot find requested file with .mjs extension."
                    );
                    Logger.log(
                        "Create storyblok.config.js or storyblok.config.mjs in your project. If u want to have custom configuration"
                    );

                    Logger.log("Using default configruration.");
                });
        });
};
