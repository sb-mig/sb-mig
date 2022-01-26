import path from "path";
import dotenv from "dotenv";
import { getFileContent } from "../utils/main.js";

dotenv.config();

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    datasourcesDirectory: string;
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
    datasourcesDirectory: "storyblok",
    componentsDirectories: ["src", "storyblok"],
    schemaFileExt: "sb.js",
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

const customConfig: any = await getFileContent({
    file: path.resolve(process.cwd(), "storyblok.config") + ".js",
});

export default {
    ...defaultConfig,
    ...customConfig,
};
