import config from "../config/config.js";

export const debug = async () => {
    console.log("storyblok.config.js: ", config, "\n");
    console.log("relevent changes ?");
};
