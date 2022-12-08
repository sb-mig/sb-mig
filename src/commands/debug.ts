import config from "../config/config.js";
import { pkg } from "../utils/pkg.js";

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");
    console.log(":)");

    if (pkg(`${process.cwd()}/package.json`).type === "module") {
        console.log("U are using new esm stuff. Good for you!");
    } else {
        console.log("Oh, common, commonjs, really? (common....js got it ?)");
    }
};
