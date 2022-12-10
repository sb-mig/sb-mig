// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate
// edit: changed a lot in here, but inspiration still is valid :)

import glob from "glob";
import path from "path";

import storyblokConfig, { SCHEMA } from "../config/config.js";
import { getFileContentWithRequire } from "./main.js";
import { buildOnTheFly } from "../rollup/build-on-the-fly.js";

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

interface DiscoverOneRequest {
    fileName: string;
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

export interface OneComponent {
    name: string;
    path: string;
}

export interface CompareResult {
    local: OneComponent[];
    external: OneComponent[];
}

type DiscoverResult = string[];

// problem with glob sync is, that when there is only one folder to search for
// we have to omit { } and when a lot, we have to use {folder1, folder2}
// so this function will normalize it based on amount of folders provided
const normalizeDiscover = ({ segments }: { segments: string[] }) => {
    if (segments.length === 1) {
        return segments[0];
    }
    return `{${segments.join(",")}}`;
};

// export const compare = (request: CompareRequest): CompareResult => {
export const compare = (request: CompareRequest): any => {
    // TODO: figure out types
    const splittedLocal = request.local.map((path) => {
        return {
            name: path.split("/")[path.split("/").length - 1], // last element of splited array - file name
            path,
        };
    });
    const splittedExternal = request.external.map((path) => {
        return {
            name: path.split("/")[path.split("/").length - 1], // last element of splited array - file name
            path,
        };
    });

    // we only want to modify external array, because we want sometimes remove stuff which are already on local (overwrite node_modules ones)
    const result = {
        local: splittedLocal,
        external: splittedExternal.filter((externalComponent) => {
            if (
                splittedLocal.find(
                    (localComponent) =>
                        externalComponent.name === localComponent.name
                )
            ) {
                return false;
            }
            return true;
        }),
    };

    return result;
};

export const discoverManyByPackageName = (
    request: DiscoverManyByPackageNameRequest
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
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter(async (file) =>
                    request.packageNames.includes(
                        await getFileContentWithRequire({ file }).name
                    )
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
                    );
                })
                .flat();
            break;
        case SCOPE.external:
            // ### MANY by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter((file) =>
                    request.packageNames.includes(
                        getFileContentWithRequire({ file }).name
                    )
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
                    );
                })
                .flat();
            break;
        case SCOPE.all:
            // ### MANY by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter((file) =>
                    request.packageNames.includes(
                        getFileContentWithRequire({ file }).name
                    )
                ) // filter only package.json from provided request.packageNames
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
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
    request: DiscoverOneByPackageNameRequest
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
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
                    );
                })
                .flat();
            break;
        case SCOPE.external:
            // ### ONE by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
                    );
                })
                .flat();
            break;
        case SCOPE.all:
            // ### ONE by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                "package.json"
            );

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true });

            listOfFiles = listOfPackagesJsonFiles
                .filter(
                    (file) =>
                        getFileContentWithRequire({ file }).name ===
                        request.packageName
                ) // filter only package.json from provided request.packageName
                .map((file) => {
                    // get path to folder in which current package.json is
                    const fileFolderPath = file
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                    const allStoryblokSchemaFilesWithinFolderPattern =
                        path.join(
                            `${fileFolderPath}`,
                            "**",
                            `[^_]*.${storyblokConfig.schemaFileExt}`
                        );

                    return glob.sync(
                        allStoryblokSchemaFilesWithinFolderPattern,
                        { follow: true }
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
    request: DiscoverManyRequest
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
                    (path: string) => !path.includes("node_modules")
                );

            if (storyblokConfig.schemaType === SCHEMA.TS) {
                pattern = path.join(
                    `${directory}/${normalizeDiscover({
                        segments: onlyLocalComponentsDirectories,
                    })}`,
                    "**",
                    `${normalizeDiscover({ segments: request.fileNames })}.sb.${
                        storyblokConfig.schemaType
                    }`
                );

                const listOfFilesToCompile = glob.sync(pattern, {
                    follow: true,
                });
                await buildOnTheFly({ files: listOfFilesToCompile });

                pattern = path.join(
                    directory,
                    ".next",
                    "cache",
                    "sb-mig",
                    "**",
                    `${normalizeDiscover({ segments: request.fileNames })}.${
                        storyblokConfig.schemaFileExt
                    }`
                );

                listOFSchemaTSFilesCompiled = glob.sync(pattern, {
                    follow: true,
                });
            }

            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            listOfFiles = [...listOfFiles, ...listOFSchemaTSFilesCompiled];
            break;

        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.lock:
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.schemaFileExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverManyDatasources = (
    request: DiscoverManyRequest
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
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.datasourceExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.datasourceExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.datasourceExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverDatasources = (
    request: DiscoverRequest
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverOne = (request: DiscoverOneRequest): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ONE - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${request.fileName}.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            );
            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.external:
            // ### ONE - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${request.fileName}.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            );
            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.all:
            // ### ONE - ALL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${request.fileName}.${storyblokConfig.schemaFileExt}`
            );
            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discover = (request: DiscoverRequest): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    const filesPattern = (componentDirectories: string[]): string => {
        return componentDirectories.length === 1
            ? path.join(
                  `${directory}/${componentDirectories[0]}`,
                  "**",
                  `[^_]*.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
              )
            : path.join(
                  `${directory}/{${componentDirectories.join(",")}}`,
                  "**",
                  `[^_]*.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
              );
    };

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (path: string) => !path.includes("node_modules")
                );
            pattern = filesPattern(onlyLocalComponentsDirectories);

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = filesPattern(
                onlyNodeModulesPackagesComponentsDirectories
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = filesPattern(storyblokConfig.componentsDirectories);

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverManyStyles = (
    request: DiscoverManyRequest
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
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.scss`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.scss`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.scss`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;

        default:
            break;
    }

    return listOfFiles;
};

export const discoverRoles = (request: DiscoverRequest): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `[^_]*.${storyblokConfig.rolesExt}` // all files with 'ext' extension, without files beggining with _
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        default:
            break;
    }

    return listOfFiles;
};

export const discoverManyRoles = (
    request: DiscoverManyRequest
): DiscoverResult => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    let pattern;
    let listOfFiles = [""];

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories =
                storyblokConfig.componentsDirectories.filter(
                    (path: string) => !path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyLocalComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories =
                storyblokConfig.componentsDirectories.filter((path: string) =>
                    path.includes("node_modules")
                );
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: onlyNodeModulesPackagesComponentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}/${normalizeDiscover({
                    segments: storyblokConfig.componentsDirectories,
                })}`,
                "**",
                `${normalizeDiscover({ segments: request.fileNames })}.${
                    storyblokConfig.rolesExt
                }`
            );

            listOfFiles = glob.sync(pattern, { follow: true });
            break;
        default:
            break;
    }

    return listOfFiles;
};
