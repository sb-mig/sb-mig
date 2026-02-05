// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate
// edit: changed a lot in here, but inspiration still is valid :)

import path from "path";

// Support both ESM and CommonJS glob exports across versions
import * as glob from "glob";
const globSync =
    (glob as unknown as { globSync?: typeof import("glob").globSync })
        .globSync ??
    (glob as unknown as { sync?: typeof import("glob").globSync }).sync ??
    (
        glob as unknown as {
            default?: { globSync?: typeof import("glob").globSync };
        }
    ).default?.globSync ??
    (glob as unknown as { default?: { sync?: typeof import("glob").globSync } })
        .default?.sync;

if (!globSync) {
    throw new Error(
        "Unable to resolve globSync from 'glob'. Please ensure a compatible glob version is installed.",
    );
}

import storyblokConfig, { SCHEMA } from "../../config/config.js";
import { buildOnTheFly } from "../../rollup/build-on-the-fly.js";
import { getFileContentWithRequire, readFile } from "../../utils/files.js";
import {
    normalizeDiscover,
    filesPattern,
    compare,
    type CompareResult,
    type OneFileElement,
} from "../../utils/path-utils.js";

export enum SCOPE {
    local = "local",
    external = "external",
    lock = "lock",
    all = "all",
}

export enum LOOKUP_TYPE {
    packagName = "packageName",
    fileName = "fileName",
}

interface DiscoverRequest {
    scope: SCOPE;
    type: LOOKUP_TYPE;
}

interface DiscoverManyRequest {
    fileNames: string[];
    scope: SCOPE;
    type: LOOKUP_TYPE;
}

interface DiscoverOneByPackageNameRequest {
    packageName: string;
    scope: SCOPE;
}

interface DiscoverManyByPackageNameRequest {
    packageNames: string[];
    scope: SCOPE;
}

type DiscoverResult = string[];

// Re-export types for backwards compatibility
export type { CompareResult, OneFileElement };

// Re-export functions for backwards compatibility
export {
    normalizeDiscover,
    compare,
    filesPattern,
} from "../../utils/path-utils.js";

export const discoverManyByPackageName = (
    request: DiscoverManyByPackageNameRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];
    let listOfPackagesJsonFiles;

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY by PACKAGE - LOCAL - packageName
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter(async (file) =>
                    request.packageNames.includes(
                        await getFileContentWithRequire({ file }).name,
                    ),
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;
        case SCOPE.external:
            // ### MANY by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter((file) =>
                    request.packageNames.includes(
                        getFileContentWithRequire({ file }).name,
                    ),
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;
        case SCOPE.all:
            // ### MANY by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter((file) =>
                    request.packageNames.includes(
                        getFileContentWithRequire({ file }).name,
                    ),
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverOneByPackageName = (
    request: DiscoverOneByPackageNameRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];
    let listOfPackagesJsonFiles;

    switch (request.scope) {
        case SCOPE.local:
            // ### ONE by PACKAGE - LOCAL - packageName
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName,
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;
        case SCOPE.external:
            // ### ONE by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName,
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;
        case SCOPE.all:
            // ### ONE by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                "package.json",
            );

            listOfPackagesJsonFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName,
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split(path.sep)
                        .slice(0, -1)
                        .join(path.sep);
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`,
                        );

                    return globSync(
                        allStoryblokSchemaFilesWithinFolderPattern.replace(
                            /\\/g,
                            "/",
                        ),
                        { follow: true },
                    );
                })
                .flat();
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverMany = async (
    request: DiscoverManyRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles: string[] = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}`,
                    `${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `${normalizeDiscover({ segments: request.fileNames })}.sb.${
                        storyblokConfig.schemaType
                    }`,
                );

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `${normalizeDiscover({ segments: request.fileNames })}.${
                        storyblokConfig.schemaFileExt
                    }`,
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;

        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        case SCOPE.lock:
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverManyDatasources = async (
    request: DiscoverManyRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}`,
                    `${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `${normalizeDiscover({
                        segments: request.fileNames,
                    })}.sb.datasource.${storyblokConfig.schemaType}`,
                );

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `${normalizeDiscover({
                        segments: request.fileNames,
                    })}.${storyblokConfig.datasourceExt}`,
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({
                    segments: request.fileNames,
                })}.${storyblokConfig.datasourceExt}`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;

        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.datasourceExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.datasourceExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverStories = (
    request: DiscoverManyRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );
            const pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.storiesExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverMigrationConfig = (
    request: DiscoverManyRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            // const onlyLocalComponentsDirectories =
            //     storyblokConfig.componentsDirectories.filter(
            //         (p: string) => !p.includes("node_modules")
            //     );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.migrationConfigExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverAllMigrationConfigs = (
    request: DiscoverRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles: string[] = [];

    switch (request.scope) {
        case SCOPE.local: {
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.migrationConfigExt}`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        }
        case SCOPE.external: {
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.migrationConfigExt}`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        }
        case SCOPE.all: {
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.migrationConfigExt}`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        }
        default:
            break;
    }

    return listOfFiles;
};

export const discoverVersionMapping = (
    request: DiscoverManyRequest,
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.all:
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({
                    segments: request.fileNames,
                })}.${"sb.migrations.cjs"}`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverDatasources = async (
    request: DiscoverRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}`,
                    `${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `[^_]*.sb.datasource.${storyblokConfig.schemaType}`, // all files with 'ext' extension, without files beggining with _
                );

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                if (storyblokConfig.debug) {
                    console.log(
                        "############# listOfFileToCompile #############",
                    );
                    console.log(listOfFilesToCompile);
                    console.log(
                        "###############################################",
                    );
                }

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `[^_]*.${storyblokConfig.datasourceExt}`, // all files with 'ext' extension, without files beggining with _
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discover = async (
    request: DiscoverRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = ".";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = filesPattern({
                    mainDirectory: directory,
                    componentDirectories: onlyLocalComponentsDirectories,
                    ext: "sb.ts",
                });

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `[^_]*.${storyblokConfig.schemaFileExt}`,
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = filesPattern({
                mainDirectory: directory,
                componentDirectories: onlyLocalComponentsDirectories,
                ext: storyblokConfig.schemaFileExt,
            });

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = filesPattern({
                mainDirectory: directory,
                componentDirectories:
                    onlyNodeModulesPackagesComponentsDirectories,
                ext: storyblokConfig.schemaFileExt,
            });

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = filesPattern({
                mainDirectory: directory,
                componentDirectories: storyblokConfig.componentsDirectories,
                ext: storyblokConfig.schemaFileExt,
            });

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverResolvers = async (
    request: DiscoverRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = ".";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = filesPattern({
                    mainDirectory: directory,
                    componentDirectories: onlyLocalComponentsDirectories,
                    ext: "sb.resolvers.ts",
                });

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `[^_]*.sb.resolvers.cjs`,
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = filesPattern({
                mainDirectory: directory,
                componentDirectories: onlyLocalComponentsDirectories,
                ext: "sb.resolvers.cjs",
            });

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverRoles = async (
    request: DiscoverRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = ".";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}`,
                    `${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `[^_]*.sb.roles.${storyblokConfig.schemaType}`, // all files with 'ext' extension, without files beggining with _
                );

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `[^_]*.${storyblokConfig.rolesExt}`, // all files with 'ext' extension, without files beggining with _
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];

            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}`, // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverManyRoles = async (
    request: DiscoverManyRequest,
): Promise<DiscoverResult> => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles: string[] = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            let listOFSchemaTSFilesCompiled: string[] = [];

            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (p: string) => !p.includes("node_modules"),
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}`,
                    `${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `${normalizeDiscover({
                        segments: request.fileNames,
                    })}.sb.roles.${storyblokConfig.schemaType}`,
                );

                const listOfFilesToCompile = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );

                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `${normalizeDiscover({
                        segments: request.fileNames,
                    })}.${storyblokConfig.rolesExt}`,
                );

                listOFSchemaTSFilesCompiled = globSync(
                    pattern.replace(/\\/g, "/"),
                    {
                        follow: true,
                    },
                );
            }

            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((p: string) =>
                    p.includes("node_modules"),
                );
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}`,
                `${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`,
            );

            listOfFiles = globSync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverAllComponents = async () => {
    // #1: discover all external .sb.js files
    const allLocalSbComponentsSchemaFiles = await discover({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    // #2: discover all local .sb.js files
    const allExternalSbComponentsSchemaFiles = await discover({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });
    // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    return { local, external };
};

export const discoverAllMigrations = () => {
    const allLocalMigrationFiles = discoverAllMigrationConfigs({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    const allExternalMigrationFiles = discoverAllMigrationConfigs({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });

    const { local, external } = compare({
        local: allLocalMigrationFiles,
        external: allExternalMigrationFiles,
    });

    return { local, external };
};

export interface MigrationInfo {
    name: string;
    filePath: string;
    scope: "local" | "external";
    targetComponents: string[];
    applied: { story: boolean; preset: boolean };
}

export const enrichMigrationInfo = async (allMigrations: {
    local: OneFileElement[];
    external: OneFileElement[];
}): Promise<MigrationInfo[]> => {
    let appliedMigrations: { story: string[]; preset: string[] } = {
        story: [],
        preset: [],
    };

    try {
        const fileContent = (await readFile(
            "applied-backpack-migrations.json",
        )) as string;
        const parsed = JSON.parse(fileContent);
        appliedMigrations = parsed.migrations || { story: [], preset: [] };
        if (Array.isArray(appliedMigrations)) {
            appliedMigrations = {
                story: appliedMigrations as unknown as string[],
                preset: [],
            };
        }
    } catch {
        // File doesn't exist or is invalid — treat as no migrations applied
    }

    const ext = storyblokConfig.migrationConfigExt;
    const results: MigrationInfo[] = [];

    const processFiles = (
        files: OneFileElement[],
        scope: "local" | "external",
    ) => {
        for (const file of files) {
            const name = file.name.replace(`.${ext}`, "");

            let targetComponents: string[];
            try {
                const content = getFileContentWithRequire({
                    file: file.p,
                });
                targetComponents = Object.keys(content);
            } catch {
                targetComponents = ["<error loading>"];
            }

            results.push({
                name,
                filePath: file.p,
                scope,
                targetComponents,
                applied: {
                    story: appliedMigrations.story.includes(name),
                    preset: appliedMigrations.preset.includes(name),
                },
            });
        }
    };

    processFiles(allMigrations.local, "local");
    processFiles(allMigrations.external, "external");

    return results;
};
