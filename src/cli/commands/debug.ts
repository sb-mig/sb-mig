import path from "path";

import config from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { getFileContentWithRequire } from "../../utils/main.js";
import { pkg } from "../../utils/pkg.js";

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");
    Logger.log(" ");
    Logger.log(" ");
    Logger.log(" ");
    Logger.log(" ");

    try {
        const fileContent = await getFileContentWithRequire({
            file: path.join("..", "..", "package.json"),
        });

        Logger.log("sb-mig version: ");
        Logger.success(fileContent["version"]);
        Logger.log(" ");
        Logger.log("Version used: ");
        Logger.success(
            `storyblok-js-client: ${fileContent["dependencies"]["storyblok-js-client"]}`
        );
        Logger.success(
            `typescript: ${fileContent["dependencies"]["typescript"]}`
        );
        Logger.log(" ");
        Logger.log(" ");

        if (
            pkg(path.join(`${process.cwd()}`, `package.json`)).type === "module"
        ) {
            Logger.log("U are using new esm stuff. Good for you!");
        } else {
            Logger.log("Oh, common, commonjs, really? (common....js got it ?)");
        }
    } catch (e) {
        Logger.warning("Can't find package.json");
    }
};
