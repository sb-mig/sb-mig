import * as path from 'path'
import * as dotenv from 'dotenv'
import { promises as fs } from 'fs';

dotenv.config()

export interface IStoryblokComponentLock {
    name: string
    version: string
    modified: boolean
    location: string
    scope: string
    isLinkedInComponentFile: boolean
}

export interface IStoryblokComponentsLock {
    [name: string]: IStoryblokComponentLock
}

export interface IInstalledComponents {
    scope: string | undefined
    name: string | undefined
}

export class StoryblokComponentsLock {
    private data: IStoryblokComponentsLock
    private storyblokComponentsLockUrl: string = path.resolve(process.cwd(), 'storyblok.components.lock.js')

    constructor(data: IStoryblokComponentsLock) {
        this.data = data;
    }

    writeComponentsConfigFile(data: IStoryblokComponentsLock): boolean {
        const content = `module.exports = ${JSON.stringify(data)}`

        fs.writeFile(this.storyblokComponentsLockUrl, content, { encoding: 'utf-8' })
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

    updateComponentsLockFile(): boolean {
        const content = `module.exports = ${JSON.stringify(this.data)}`

        fs.writeFile(this.storyblokComponentsLockUrl, content, { encoding: 'utf-8' })
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

    addComponentsToComponentsConfigFile(installedComponents: IInstalledComponents[], local: boolean): IStoryblokComponentsLock {
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
                            version: "?",
                            modified: false,
                            isLinkedInComponentFile: false
                        }
                    }
                }
            }, {})
        }
    }

    getAllData(): IStoryblokComponentsLock {
        return this.data;
    }

    getSingleData(componentName: string): IStoryblokComponentLock {
        return this.data[componentName]
    }

    setAllData(data: IStoryblokComponentsLock) {
        this.data = {
            ...this.data,
            ...data
        }
    }

    setSingleData(singleComponentData: IStoryblokComponentLock): void {
        this.data[singleComponentData.name] = singleComponentData;
    }
}

let fileContent;
try {
    fileContent = require(path.resolve(process.cwd(), 'storyblok.components.lock.js'));
} catch (err) {
    fileContent = {}
}

export default new StoryblokComponentsLock(fileContent)

