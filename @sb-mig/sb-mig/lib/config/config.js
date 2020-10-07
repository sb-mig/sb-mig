"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
let customConfig = {};
try {
    customConfig = require(path.resolve(process.cwd(), 'storyblok.config'));
}
catch (error) {
    // default config will be used
    if (error.code !== "MODULE_NOT_FOUND")
        throw error;
}
const defaultConfig = {
    componentsMatchFile: "src/components/components.js",
    reactComponentsDirectory: "src/components",
    npmScopeForComponents: "@storyblok-components",
    boilerplateUrl: "git@github.com:storyblok-components/gatsby-storyblok-boilerplate.git",
    sbmigWorkingDirectory: "sbmig",
    componentDirectory: "storyblok",
    datasourcesDirectory: "storyblok",
    componentsDirectories: ["src", "storyblok"],
    schemaFileExt: "sb.js",
    storyblokApiUrl: "https://api.storyblok.com/v1",
    oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
    spaceId: process.env.STORYBLOK_SPACE_ID,
    accessToken: process.env.GATSBY_STORYBLOK_ACCESS_TOKEN || process.env.NEXT_STORYBLOK_ACCESS_TOKEN
};
exports.default = {
    ...defaultConfig,
    ...customConfig
};
