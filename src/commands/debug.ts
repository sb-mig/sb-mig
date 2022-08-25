import { createRequire } from "module";
import config from "../config/config.js";

const require = createRequire(import.meta.url);
const pkg = require(`${process.cwd()}/package.json`);

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");

    if (pkg.type === "module") {
        console.log("U are using new esm stuff. Good for you!");
    } else {
        console.log("Oh, common, commonjs, really? (common....js got it ?)");
    }
};
