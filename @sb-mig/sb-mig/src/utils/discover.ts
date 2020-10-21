// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate

import * as glob from "glob";
import * as path from "path";

import storyblokConfig from "../config/config";

export const findComponents = (componentDirectory: string) => {
    const directory = path.resolve(process.cwd(), componentDirectory);

    return glob
        .sync(path.join(directory, `**`, `!(_*|*.datasource)*.js`))
        .map((file) => require(path.resolve(directory, file)));
};

export const findComponentsWithExt = (ext: string) => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);

    const files = glob
        .sync(
            path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(
                    ","
                )}}`,
                `**`,
                `[^_]*.${ext}`
            ),
            {
                follow: true,
            }
        )
        .map((file) => require(path.resolve(directory, file)));

    const fileNames = files.map((file) => file.name);
    console.log(fileNames);

    return files;
};

export const findComponentsByPackageName = (
    ext: string | boolean,
    specifiedComponents: string[],
    local?: boolean
) => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);

    // @ts-ignore
    if (local === true) {
        const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(
            (dir) => !dir.includes("node_modules")
        );

        const onlyLocalPackages = glob.sync(
            path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            ),
            {
                follow: true,
            }
        );

        return onlyLocalPackages
            .filter((file) => {
                return specifiedComponents.includes(
                    require(path.resolve(directory, file)).name
                );
            })
            .map((file) => {
                const fileFolderPath = file.split("/").slice(0, -1).join("/");

                return glob
                    .sync(
                        path.join(`${fileFolderPath}`, `**`, `[^_]*.${ext}`),
                        {
                            follow: true,
                        }
                    )
                    .map((file) => require(path.resolve(directory, file)).name);
            })
            .flat();
    } else if (local === false) {
        const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(
            (dir) => dir.includes("node_modules")
        );

        const onlyNodeModulesPackages = glob.sync(
            path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(
                    ","
                )}}`,
                `**`,
                `package.json`
            ),
            {
                follow: true,
            }
        );

        return onlyNodeModulesPackages
            .filter((file) => {
                return specifiedComponents.includes(
                    require(path.resolve(directory, file)).name
                );
            })
            .map((file) => {
                const fileFolderPath = file.split("/").slice(0, -1).join("/");

                return glob
                    .sync(
                        path.join(`${fileFolderPath}`, `**`, `[^_]*.${ext}`),
                        {
                            follow: true,
                        }
                    )
                    .map((file) => require(path.resolve(directory, file)).name);
            })
            .flat();
    } else {
        return glob
            .sync(
                path.join(
                    `${directory}/{${storyblokConfig.componentsDirectories.join(
                        ","
                    )}}`,
                    `**`,
                    `package.json`
                ),
                {
                    follow: true,
                }
            )
            .filter((file) => {
                return specifiedComponents.includes(
                    require(path.resolve(directory, file)).name
                );
            })
            .map((file) => {
                const fileFolderPath = file.split("/").slice(0, -1).join("/");

                return glob
                    .sync(
                        path.join(`${fileFolderPath}`, `**`, `[^_]*.${ext}`),
                        {
                            follow: true,
                        }
                    )
                    .map((file) => require(path.resolve(directory, file)).name);
            })
            .flat();
    }
};

export const findDatasources = () => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);

    return (
        glob
            .sync(
                path.join(
                    `${directory}/${storyblokConfig.datasourcesDirectory}`,
                    `**`,
                    `[^_]*.sb.datasource.js`
                )
            )
            // eslint-disable-next-line global-require, import/no-dynamic-require
            .map((file) => require(path.resolve(directory, file)))
    );
};
