import Logger from "../utils/logger.js";
import type { IStoryblokConfig } from "./config.js";

export const defaultConfig = (
    pkg: any,
    path: string,
    env: any
): IStoryblokConfig => {
    const packagePath = `${path}/package.json`;

    return {
        storyblokComponentsLocalDirectory: "src/@storyblok-components",
        sbmigWorkingDirectory: "sbmig",
        componentsDirectories: ["src", "storyblok"],
        schemaFileExt: pkg(packagePath).type === "module" ? "sb.js" : "sb.cjs",
        datasourceExt:
            pkg(packagePath).type === "module"
                ? "sb.datasource.js"
                : "sb.datasource.cjs",
        rolesExt:
            pkg(packagePath).type === "module" ? "sb.roles.js" : "sb.roles.cjs",
        storyblokApiUrl: "https://mapi.storyblok.com/v1", // should be mapi.storyblok.com ?
        oauthToken: env["STORYBLOK_OAUTH_TOKEN"] ?? "",
        spaceId: env["STORYBLOK_SPACE_ID"] ?? "",
        accessToken:
            env["GATSBY_STORYBLOK_ACCESS_TOKEN"] ||
            env["NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN"] ||
            "",
        boilerplateSpaceId: 172677, // this is id of Content seed for nextjs boilerplate space
    };
};

export const getStoryblokConfigContent = (data: {
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
