import path from "path";
import dotenv from "dotenv";
import { pkg } from "../utils/pkg.js";
import Logger from "../utils/logger.js";

const getStoryblokConfigContent = (data: {
    filePath: string;
    ext: string;
}): any => {
    return import(`${data.filePath}${data.ext}`)
        .then((res) => {
            Logger.success("Found storyblok.config.js!");
            return res.default;
        })
        .catch(() => {
            Logger.warning("Cannot find requested file with .js extension.");
            Logger.log("Trying .mjs extension\n");

            return import(`${data.filePath}.mjs`)
                .then((res) => {
                    Logger.success("Found storyblok.config.mjs!");
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

dotenv.config();

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    componentsDirectories: string[];
    schemaFileExt: string;
    datasourceExt: string;
    rolesExt: string;
    storyblokApiUrl: string;
    oauthToken: string;
    spaceId: string;
    accessToken: string;
}

const defaultConfig: IStoryblokConfig = {
    storyblokComponentsLocalDirectory: "src/@storyblok-components",
    sbmigWorkingDirectory: "sbmig",
    componentsDirectories: ["src", "storyblok"],
    schemaFileExt: pkg.type === "module" ? "sb.js" : "sb.cjs",
    datasourceExt: "sb.datasource.js",
    rolesExt: "sb.roles.js",
    storyblokApiUrl: "https://api.storyblok.com/v1",
    oauthToken: process.env["STORYBLOK_OAUTH_TOKEN"] ?? "",
    spaceId: process.env["STORYBLOK_SPACE_ID"] ?? "",
    accessToken:
        process.env["GATSBY_STORYBLOK_ACCESS_TOKEN"] ||
        process.env["NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN"] ||
        "",
};

const filePath = path.resolve(process.cwd(), "storyblok.config");
const customConfig = await getStoryblokConfigContent({
    filePath,
    ext: ".js",
});

export default {
    ...defaultConfig,
    ...customConfig,
};
