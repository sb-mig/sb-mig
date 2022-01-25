import config from "../config/config.js";

export const debug = (props: any) => {
    const {
        input,
        flags,
        unnormalizedFlags,
        pkg,
        help,
        showHelp,
        showVersion,
    } = props;

    console.log("storyblok.config.js: ", config, "\n");
};
