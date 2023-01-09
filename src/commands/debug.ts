import config from "../config/config.js";
import { pkg } from "../utils/pkg.js";
import { getFileContentWithRequire } from "../utils/main.js";
import Logger from "../utils/logger.js";

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");
    console.log(" ");
    console.log(" ");
    console.log(" ");

    const fileContent = await getFileContentWithRequire({
        file: "../../package.json",
    });
    console.log("sb-mig version: ");
    Logger.success(fileContent["version"]);
    console.log(" ");
    console.log("Version used: ");
    Logger.success(
        `storyblok-js-client: ${fileContent["dependencies"]["storyblok-js-client"]}`
    );
    Logger.success(`typescript: ${fileContent["dependencies"]["typescript"]}`);
    console.log(" ");
    console.log(" ");

    if (pkg(`${process.cwd()}/package.json`).type === "module") {
        console.log("U are using new esm stuff. Good for you!");
    } else {
        console.log("Oh, common, commonjs, really? (common....js got it ?)");
    }
};
