import * as path from 'path'
import * as dotenv from 'dotenv'
import { promises as fs } from 'fs';

dotenv.config()

export interface IStoryblokComponentConfig {
    name: string
    version: string
    modified: boolean
    location: string
    locationPath: string
    scope: string
    isLinkedInComponentFile: boolean,
    isComponentStyleImported: boolean
}

export interface IStoryblokComponentsConfig {
    [name: string]: IStoryblokComponentConfig
}

export interface IInstalledComponents {
    scope: string | undefined
    name: string | undefined
}

export class StoryblokComponentsConfig {
    private data: IStoryblokComponentsConfig
    private storyblokComponentsConfigUrl: string = path.resolve(process.cwd(), 'storyblok.components.lock.js')

    constructor(data: IStoryblokComponentsConfig) {
        this.data = data;
    }

    writeComponentsConfigFile(data: IStoryblokComponentsConfig): boolean {
        const content = `module.exports = ${JSON.stringify(data, undefined, 2)}`

        fs.writeFile(this.storyblokComponentsConfigUrl, content, { encoding: 'utf-8' })
            .then((result) => {
                console.log("so what is that ?")
                console.log(result)
                return result
            })
            .catch((err: Error) => {
                console.log("error, wtf ?")
                console.log(err.message);
            })

        return true
    }

    updateComponentsConfigFile(): boolean {
        const content = `module.exports = ${JSON.stringify(this.data, undefined, 2)}`

        fs.writeFile(this.storyblokComponentsConfigUrl, content, { encoding: 'utf-8' })
            .then((result) => {
                console.log("so what is that ?")
                console.log(result)
                return true
            })
            .catch((err: Error) => {
                console.log("error, wtf ?")
                console.log(err.message);
                return false
            })
        return true
    }

    addComponentsToComponentsConfigFile(installedComponents: IInstalledComponents[], local: boolean): IStoryblokComponentsConfig {
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
                            locationPath: local ? `src/components/${curr.name}` : `node_modules/${curr.scope}/${curr.name}`,
                            isInstalled: false, // TODO: dunno if should be on initiall true or false or if it should even exist 
                            isLinkedInComponentFile: false,
                            isComponentStyleImported: false,
                        }
                    }
                }
            }, {})
        }
    }

    getAllData(): IStoryblokComponentsConfig {
        return this.data;
    }

    getSingleData(componentName: string): IStoryblokComponentConfig {
        return this.data[componentName]
    }

    setAllData(data: IStoryblokComponentsConfig) {
        this.data = {
            ...this.data,
            ...data
        }
    }

    setSingleData(singleComponentData: IStoryblokComponentConfig): void {
        this.data[singleComponentData.name] = singleComponentData;
    }
}

let fileContent;
try {
    fileContent = require(path.resolve(process.cwd(), 'storyblok.components.lock.js'));
} catch (err) {
    fileContent = {}
}

export default new StoryblokComponentsConfig(fileContent)

