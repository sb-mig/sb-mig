import * as path from 'path';
import * as dotenv from 'dotenv'

dotenv.config()

export interface IStoryblokConfig {
    componentsMatchFile: string,
    componentsStylesMatchFile: string,
    boilerplateUrl: string;
    sbmigWorkingDirectory: string;
    componentDirectory: string;
    datasourcesDirectory: string;
    componentsDirectories: string[];
    schemaFileExt: string;
    datasourceExt: string;
    storyblokApiUrl: string;
    oauthToken: string | undefined;
    spaceId: string | undefined;
    accessToken: string | undefined;
}

let customConfig = {}

try {
    customConfig = require(path.resolve(process.cwd(), 'storyblok.config'))
} catch (error) {
    // default config will be used
    if (error.code !== "MODULE_NOT_FOUND") throw error
}

const defaultConfig: IStoryblokConfig = {
    componentsMatchFile: "src/components/components.js",
    componentsStylesMatchFile: "src/styles/_ef-sbc.scss",
    boilerplateUrl: "git@github.com:storyblok-components/gatsby-storyblok-boilerplate.git",
    sbmigWorkingDirectory: "sbmig",
    componentDirectory: "storyblok",
    datasourcesDirectory: "storyblok",
    componentsDirectories: ["src", "storyblok"],
    schemaFileExt: "sb.js",
    datasourceExt: "sb.datasource.js",
    storyblokApiUrl: "https://api.storyblok.com/v1",
    oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
    spaceId: process.env.STORYBLOK_SPACE_ID,
    accessToken: process.env.GATSBY_STORYBLOK_ACCESS_TOKEN || process.env.NEXT_STORYBLOK_ACCESS_TOKEN
}

export default {
    ...defaultConfig,
    ...customConfig
}