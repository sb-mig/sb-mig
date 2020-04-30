import * as path from 'path';
import * as dotenv from 'dotenv'

dotenv.config()

export interface IStoryblokConfig {
    reactComponentsDirectory: string;
    npmScopeForComponents: string;
    boilerplateUrl: string;
    sbmigWorkingDirectory: string;
    componentDirectory: string;
    datasourcesDirectory: string;
    componentsDirectories: string[];
    schemaFileExt: string;
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
    reactComponentsDirectory: "src/components",
    npmScopeForComponents: "@storyblok-components",
    boilerplateUrl: "git@github.com:marckraw/gatsby-storyblok-boilerplate.git",
    sbmigWorkingDirectory: "sbmig",
    componentDirectory: "storyblok",
    datasourcesDirectory: "storyblok",
    componentsDirectories: ["src", "storyblok"],
    schemaFileExt: "sb.js",
    storyblokApiUrl: "https://api.storyblok.com/v1",
    oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
    spaceId: process.env.STORYBLOK_SPACE_ID,
    accessToken: process.env.GATSBY_STORYBLOK_ACCESS_TOKEN
}

export default {
    ...defaultConfig,
    ...customConfig
}