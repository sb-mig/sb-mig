import path from "path";
import dotenv from "dotenv";
import { getFileContent } from "../utils/main.js";

dotenv.config();

export interface IStoryblokConfig {
    componentsMatchFile: string;
    storyblokComponentsListfile: string;
    storyblokComponentsLocalDirectory: string;
    componentsStylesMatchFile: string;
    boilerplateUrl: string;
    sbmigWorkingDirectory: string;
    componentDirectory: string;
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
    componentsMatchFile: "src/components/components.js",
    storyblokComponentsListfile:
        "src/components/storyblok-components.componentList.js",
    storyblokComponentsLocalDirectory: "src/@storyblok-components",
    componentsStylesMatchFile:
        "src/@storyblok-components/_storyblok-components.scss",
    boilerplateUrl:
        "git@github.com:storyblok-components/gatsby-storyblok-boilerplate.git",
    sbmigWorkingDirectory: "sbmig",
    componentDirectory: "storyblok",
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
