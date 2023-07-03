import type StoryblokClient from "storyblok-js-client";

import path from "path";

import dotenv from "dotenv";

import { pkg } from "../utils/pkg.js";

import { defaultConfig, getStoryblokConfigContent, SCHEMA } from "./helper.js";

dotenv.config();

type SchemaType = (typeof SCHEMA)[keyof typeof SCHEMA];

export { SCHEMA };

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    presetsBackupDirectory: string;
    storiesBackupDirectory: string;
    componentsDirectories: string[];
    awsBucketData: {
        bucketName: string;
        s3Url: `s3://${string}`;
        httpUrl: `https://${string}`;
    };
    metadataSelection: Record<string, any>;
    contentHubOriginUrl: string;
    contentHubAuthorizationToken: string;
    schemaFileExt: "sb.cjs" | "sb.js";
    datasourceExt: string;
    rolesExt: string;
    storiesExt: string;
    migrationConfigExt: string;
    storyblokApiUrl: string;
    storyblokDeliveryApiUrl: string;
    storyblokGraphqlApiUrl: string;
    oauthToken: string;
    spaceId: string;
    accessToken: string;
    boilerplateSpaceId: string;
    schemaType: SchemaType;
    flushCache: boolean;
    cacheDir: string;
    debug: boolean;
    rateLimit: number;
    sbApi?: () => StoryblokClient | StoryblokClient;
}

const filePath = path.resolve(process.cwd(), "storyblok.config");

const customConfig = await getStoryblokConfigContent({
    filePath,
    ext: ".js",
});

export default {
    ...defaultConfig(pkg, `${process.cwd()}`, process.env),
    ...customConfig,
} as IStoryblokConfig;
