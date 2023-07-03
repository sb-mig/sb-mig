import type { IStoryblokConfig } from "./config.js";

import { SCHEMA } from "./constants.js";

export const defaultConfig = (
    pkg: any,
    path: string,
    env: any
): IStoryblokConfig => {
    const packagePath = `${path}/package.json`;

    const sbmigWorkingDirectory = "sbmig";

    return {
        storyblokComponentsLocalDirectory: "src/@storyblok-components",
        sbmigWorkingDirectory: sbmigWorkingDirectory,
        presetsBackupDirectory: `component-presets`,
        storiesBackupDirectory: `stories`,
        componentsDirectories: ["src", "storyblok"],
        awsBucketData: {
            bucketName: "site-builder-content-hub",
            s3Url: "s3://site-builder-content-hub",
            httpUrl:
                "https://site-builder-content-hub.s3.eu-central-1.amazonaws.com",
        },
        contentHubOriginUrl:
            "https://site-builder-content-hub.vercel.app/api/hub/",
        contentHubAuthorizationToken: "",
        metadataSelection: {
            name: true,
            version: true,
            author: true,
            description: true,
        },
        schemaFileExt: pkg(packagePath).type === "module" ? "sb.js" : "sb.cjs",
        datasourceExt:
            pkg(packagePath).type === "module"
                ? "sb.datasource.js"
                : "sb.datasource.cjs",
        rolesExt:
            pkg(packagePath).type === "module" ? "sb.roles.js" : "sb.roles.cjs",
        migrationConfigExt:
            pkg(packagePath).type === "module"
                ? "sb.migration.js"
                : "sb.migration.cjs",
        // storiesExt:
        //     pkg(packagePath).type === "module"
        //         ? "sb.stories.js"
        //         : "sb.stories.cjs",
        storiesExt: "sb.stories.json",
        storyblokApiUrl:
            env["STORYBLOK_MANAGEMENT_API_URL"] ||
            "https://mapi.storyblok.com/v1", // should be mapi.storyblok.com ?
        storyblokDeliveryApiUrl:
            env["STORYBLOK_DELIVERY_API_URL"] || "https://api.storyblok.com/v2",
        storyblokGraphqlApiUrl:
            env["STORYBLOK_GRAPHQL_API_URL"] ||
            "https://gapi.storyblok.com/v1/api",
        oauthToken: env["STORYBLOK_OAUTH_TOKEN"] ?? "",
        spaceId: env["STORYBLOK_SPACE_ID"] ?? "",
        accessToken:
            env["GATSBY_STORYBLOK_ACCESS_TOKEN"] ||
            env["NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN"] ||
            "",
        boilerplateSpaceId: "172677", // this is id of Content seed for nextjs boilerplate space
        schemaType: SCHEMA.JS,
        flushCache: true,
        cacheDir: ".next/cache",
        debug: false,
        rateLimit: 2,
    };
};
