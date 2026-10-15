import path from "path";

import config from "../../config/config.js";
import {
    getConsumerPackageJson,
    getSbMigPackageJson,
} from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { pkg } from "../../utils/pkg.js";

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");
    Logger.log(" ");
    Logger.log(" ");
    Logger.log(" ");
    Logger.log(" ");

    console.log("whatever man just testing");

    try {
        const fileContent = await getSbMigPackageJson();
        const consumerPkg = await getConsumerPackageJson();

        Logger.log("sb-mig version: ");
        Logger.success(fileContent["version"]);
        Logger.log(" ");
        Logger.log("Version used: ");
        Logger.success(
            `storyblok-js-client: ${fileContent["dependencies"]["storyblok-js-client"]}`,
        );
        Logger.success(
            `typescript: ${fileContent["dependencies"]["typescript"]}`,
        );
        Logger.success(
            `@ef-global/backpack: ${consumerPkg["dependencies"]["@ef-global/backpack"]}`,
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
