import type { IStoryblokConfig } from "./config.js";

import Logger from "../utils/logger.js";

import { SCHEMA } from "./config.js";

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
        presetsBackupDirectory: `${sbmigWorkingDirectory}/component-presets`,
        storiesBackupDirectory: `${sbmigWorkingDirectory}/stories`,
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
        storiesExt:
            pkg(packagePath).type === "module"
                ? "sb.stories.js"
                : "sb.stories.cjs",
        storyblokApiUrl: "https://mapi.storyblok.com/v1", // should be mapi.storyblok.com ?
        storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
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

export const getStoryblokConfigContent = (data: {
    filePath: string;
    ext: string;
}): any => {
    let prefix = "";

    if (process.platform === "win32") {
        prefix = "file://";
    }
    return import(`${prefix}${data.filePath}${data.ext}`)
        .then((res) => {
            Logger.success("Found storyblok.config.js!");
            return res.default;
        })
        .catch(() => {
            Logger.warning("Cannot find requested file with .js extension.");
            Logger.log("Trying .mjs extension\n");

            return import(`${prefix}${data.filePath}.mjs`)
                .then((res) => {
                    Logger.success("Found storyblok.config.mjs!");
                    console.log("res", res);
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
