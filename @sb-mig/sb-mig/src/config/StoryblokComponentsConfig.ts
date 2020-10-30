import * as path from "path";
import * as dotenv from "dotenv";
import { promises as fs } from "fs";
import * as camelcase from "camelcase";
import storyblokConfig from "./config";
import { discoverManyStyles, LOOKUP_TYPE, SCOPE } from "../utils/discover2";

dotenv.config();

export interface IStoryblokComponentConfig {
    name: string;
    version: string;
    modified: boolean;
    location: string;
    locationPath: string;
    scope: string;
    isLinkedInComponentFile: boolean;
    isComponentStyleImported: boolean;
    links: {
        [name: string]: {
            [name: string]: string;
        };
    };
}

export interface IStoryblokComponentsConfig {
    [name: string]: IStoryblokComponentConfig;
}

export interface IInstalledComponents {
    scope: string | undefined;
    name: string | undefined;
}

export enum SWAP_TOKEN {
    componentImports = "componentImports",
    componentLists = "componentLists",
    styleImports = "styleImports",
}

interface CreateCrumb {
    to: string;
    token: SWAP_TOKEN;
}

interface NameString {
    [name: string]: string;
}

export class StoryblokComponentsConfig {
    private componentImportsToken: string =
        "// --- sb-mig scoped component imports ---";
    private componentComponentsListToken: string =
        "// --- sb-mig scoped component list ---";
    private componentStylesImportsToken: string =
        "// --- sb-mig scoped component styles imports ---";

    private data: IStoryblokComponentsConfig;
    private storyblokComponentsConfigUrl: string = path.resolve(
        process.cwd(),
        "storyblok.components.lock.js"
    );

    constructor(data: IStoryblokComponentsConfig) {
        this.data = data;
    }

    updateComponentsConfigFile(): boolean {
        const content = `module.exports = ${JSON.stringify(
            this.data,
            undefined,
            2
        )}`;

        fs.writeFile(this.storyblokComponentsConfigUrl, content, {
            encoding: "utf-8",
        })
            .then((result) => {
                console.log("Done");
                console.log(result);
                return true;
            })
            .catch((err: Error) => {
                console.log("error, wtf ?");
                console.log(err.message);
                return false;
            });
        return true;
    }

    addComponentsToComponentsConfigFile({
        installedComponents,
        local,
    }: {
        installedComponents: IInstalledComponents[];
        local: boolean;
    }): IStoryblokComponentsConfig {
        return {
            ...this.data,
            ...installedComponents.reduce((prev: any, curr: any) => {
                if (!this.getSingleData(`${curr.scope}/${curr.name}`)) {
                    const stylesFileAvailable =
                        discoverManyStyles({
                            fileNames: [curr.name],
                            scope: SCOPE.all,
                            type: LOOKUP_TYPE.fileName,
                        }).length > 0;

                    return {
                        ...prev,
                        [`${curr.scope}/${curr.name}`]: {
                            name: `${curr.scope}/${curr.name}`,
                            scope: curr.scope,
                            location: local ? "local" : "node_modules",
                            locationPath: local
                                ? `src/components/${curr.name}`
                                : `node_modules/${curr.scope}/${curr.name}`,
                            links: {
                                [storyblokConfig.storyblokComponentsListfile]: {
                                    "// --- sb-mig scoped component imports ---": local
                                        ? `import * as Scoped${camelcase(
                                              curr.name,
                                              { pascalCase: true }
                                          )} from "./${curr.name}";`
                                        : `import * as Scoped${camelcase(
                                              curr.name,
                                              { pascalCase: true }
                                          )} from "${curr.scope}/${
                                              curr.name
                                          }";`,
                                    "// --- sb-mig scoped component list ---": `Scoped${camelcase(
                                        curr.name,
                                        { pascalCase: true }
                                    )}.ComponentList`,
                                },
                                [storyblokConfig.componentsStylesMatchFile]: {
                                    "// --- sb-mig scoped component styles imports ---": stylesFileAvailable
                                        ? local
                                            ? `@import './${curr.name}/${curr.name}.scss';`
                                            : `@import '${curr.scope}/${curr.name}/src/${curr.name}.scss';`
                                        : "",
                                },
                            },
                        },
                    };
                }
            }, {}),
        };
    }

    getAllData(): IStoryblokComponentsConfig {
        return this.data;
    }

    getSingleData(componentName: string): IStoryblokComponentConfig {
        return this.data[componentName];
    }

    setAllData(data: IStoryblokComponentsConfig) {
        this.data = {
            ...data,
        };
    }

    setSingleData(singleComponentData: IStoryblokComponentConfig): void {
        this.data[singleComponentData.name] = singleComponentData;
    }

    /**
     *
     * Based on storyblok.componnets.lock.js file,
     * return proper content of specific files
     * (storyblok-components.componentList.js and storyblok-componnets-styles.scss)
     */
    createCrumb({ to, token }: CreateCrumb) {
        const dataEntries = Object.entries(this.data);
        let temp: any;

        switch (token) {
            case SWAP_TOKEN.componentImports:
                temp = dataEntries
                    .map((component) => component[1].links)
                    .map(
                        (component) =>
                            component[to] !== undefined && component[to]
                    )
                    .filter((elements) => elements !== false)
                    .reduce(
                        // @ts-ignore
                        (acc: string[], curr: NameString) => {
                            return [...acc, curr[this.componentImportsToken]];
                        },
                        [this.componentImportsToken]
                    );
                break;
            case SWAP_TOKEN.componentLists:
                temp = dataEntries
                    .map((component) => component[1].links)
                    .map(
                        (component) =>
                            component[to] !== undefined && component[to]
                    )
                    .filter((elements) => elements !== false)
                    .reduce(
                        // @ts-ignore
                        (acc: string[], curr: NameString) => {
                            return [
                                ...acc,
                                curr[this.componentComponentsListToken],
                            ];
                        },
                        [this.componentComponentsListToken]
                    );
                break;
            case SWAP_TOKEN.styleImports:
                temp = dataEntries
                    .map((component) => component[1].links)
                    .map(
                        (component) =>
                            component[to] !== undefined && component[to]
                    )
                    .filter((elements) => elements !== false)
                    .reduce(
                        // @ts-ignore
                        (acc: string[], curr: NameString) => {
                            return [
                                ...acc,
                                curr[this.componentStylesImportsToken],
                            ];
                        },
                        [this.componentStylesImportsToken]
                    );
                break;

            default:
                break;
        }

        return temp?.filter((element: string) => element);
    }

    /**
     * This updates storyblok components file with imports and
     * exports of componentList part of the component, based on
     * storyblok.components.lock file links property
     */
    updateStoryblokComponentsFile() {
        // one file
        const crumb1 = this.createCrumb({
            to: storyblokConfig.storyblokComponentsListfile,
            token: SWAP_TOKEN.componentImports,
        });
        let crumb2 = this.createCrumb({
            to: storyblokConfig.storyblokComponentsListfile,
            token: SWAP_TOKEN.componentLists,
        });

        let content = `${crumb1.join("\n")}\n`;
        content = `${content}\nexport default [
            ${crumb2.shift()}
            ${crumb2.map((partial: string) => `${partial},`).join("\n")}
        ]\n`;

        // update actual file
        fs.writeFile(storyblokConfig.storyblokComponentsListfile, content, {
            encoding: "utf-8",
        })
            .then((result) => {
                console.log("Done");
                console.log(result);
                return true;
            })
            .catch((err: Error) => {
                console.log("error, wtf ?");
                console.log(err.message);
                return false;
            });
    }

    /**
     * This updates storyblok components styles file with style imports
     * based on storyblok.components.lock file links property
     */
    updateStoryblokComponentStylesFile() {
        // one file
        const crumb1 = this.createCrumb({
            to: storyblokConfig.componentsStylesMatchFile,
            token: SWAP_TOKEN.styleImports,
        });

        let content = `${crumb1.join("\n")}\n`;

        // update actual file
        fs.writeFile(storyblokConfig.componentsStylesMatchFile, content, {
            encoding: "utf-8",
        })
            .then((result) => {
                console.log("Done");
                console.log(result);
                return true;
            })
            .catch((err: Error) => {
                console.log("error, wtf ?");
                console.log(err.message);
                return false;
            });
    }
}

let fileContent;
try {
    fileContent = require(path.resolve(
        process.cwd(),
        "storyblok.components.lock.js"
    ));
} catch (err) {
    fileContent = {};
}

export default new StoryblokComponentsConfig(fileContent);
