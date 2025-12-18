// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate
// edit: changed a lot in here, but inspiration still is valid :)

import path from "path";

import glob from "glob";

import storyblokConfig, { SCHEMA } from "../../config/config.js";
import { buildOnTheFly } from "../../rollup/build-on-the-fly.js";
import { getFileContentWithRequire } from "../../utils/files.js";

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

interface CompareRequest {
    local: string[];
    external: string[];
}

export interface OneFileElement {
    name: string;
    p: string;
}

export interface CompareResult {
    local: OneFileElement[];
    external: OneFileElement[];
}

type DiscoverResult = string[];

// problem with glob sync is, that when there is only one folder to search for
// we have to omit { } and when a lot, we have to use {folder1, folder2}
// so this function will normalize it based on amount of folders provided
export const normalizeDiscover = ({ segments }: { segments: string[] }) => {
    if (segments.length === 0) {
        return "";
    }
    if (segments.length === 1) {
        return segments[0];
    }
    return `{${segments.join(",")}}`;
};

export const compare = (request: CompareRequest): CompareResult => {
    const { local, external } = request;

    const splittedLocal = local.map((p) => {
        return {
            name: p.split(path.sep)[p.split(path.sep).length - 1], // last element of splited array - file name
            p,
        };
    });
    const splittedExternal = external
        .map((p) => {
            return {
                name: p.split(path.sep)[p.split(path.sep).length - 1], // last element of splited array - file name
                p,
            };
        })
        .filter((file) => {
            // 1. check if the file has node_modules > 1
            const nodeModulesCount = (file.p.match(/node_modules/g) || [])
                .length;
            return nodeModulesCount <= 1;
        });

    // we only want to modify external array, because we want sometimes remove stuff which are already on local (overwrite node_modules ones)
    const result = {
        local: splittedLocal,
        external: splittedExternal.filter((externalComponent) => {
            if (
                splittedLocal.find(
                    (localComponent) =>
                        externalComponent.name === localComponent.name,
                )
            ) {
                return false;
            }
            return true;
        }),
    } as CompareResult;

    return result;
};

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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

            listOfPackagesJsonFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                    return glob.sync(
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });

            break;

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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
                follow: true,
            });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const filesPattern = ({
    mainDirectory,
    componentDirectories,
    ext,
}: {
    mainDirectory: string;
    componentDirectories: string[];
    ext: string;
}): string => {
    return componentDirectories.length === 1
        ? path.join(
              `${mainDirectory}`,
              `${componentDirectories[0]}`,
              "**",
              `[^_]*.${ext}`, // all files with 'ext' extension, without files beggining with _
          )
        : path.join(
              `${mainDirectory}`,
              `{${componentDirectories.join(",")}}`,
              "**",
              `[^_]*.${ext}`, // all files with 'ext' extension, without files beggining with _
          );
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

                const listOfFilesToCompile = glob.sync(
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

                listOFSchemaTSFilesCompiled = glob.sync(
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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

            listOfFiles = glob.sync(pattern.replace(/\\/g, "/"), {
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
