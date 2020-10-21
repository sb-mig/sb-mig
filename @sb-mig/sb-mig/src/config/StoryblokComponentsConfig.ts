import * as path from "path";
import * as dotenv from "dotenv";
import { promises as fs } from "fs";

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

    writeComponentsConfigFile(data: IStoryblokComponentsConfig): boolean {
        const content = `module.exports = ${JSON.stringify(
            data,
            undefined,
            2
        )}`;

        fs.writeFile(this.storyblokComponentsConfigUrl, content, {
            encoding: "utf-8",
        })
            .then((result) => {
                console.log("so what is that ?");
                console.log(result);
                return result;
            })
            .catch((err: Error) => {
                console.log("error, wtf ?");
                console.log(err.message);
            });

        return true;
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
                console.log("so what is that ?");
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

    addComponentsToComponentsConfigFile(
        installedComponents: IInstalledComponents[],
        local: boolean
    ): IStoryblokComponentsConfig {
        return {
            ...this.data,
            ...installedComponents.reduce((prev: any, curr: any) => {
                if (!this.getSingleData(`${curr.scope}/${curr.name}`)) {
                    return {
                        ...prev,
                        [`${curr.scope}/${curr.name}`]: {
                            name: `${curr.scope}/${curr.name}`,
                            scope: curr.scope,
                            location: local ? "local" : "node_modules",
                            locationPath: local
                                ? `src/components/${curr.name}`
                                : `node_modules/${curr.scope}/${curr.name}`,
                            isLinkedInComponentFile: false,
                            isComponentStyleImported: false,
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
            ...this.data,
            ...data,
        };
    }

    setSingleData(singleComponentData: IStoryblokComponentConfig): void {
        this.data[singleComponentData.name] = singleComponentData;
    }

    createCrumb({ to, token }: CreateCrumb) {
        const dataEntries = Object.entries(this.data);
        let temp: unknown;
        // console.log(dataEntries)

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
