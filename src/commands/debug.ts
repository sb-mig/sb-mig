import config from "../config/config.js";

export const debug = async () => {
    console.log("v4.0.0");
    console.log("storyblok.config.js: ", config, "\n");
};
