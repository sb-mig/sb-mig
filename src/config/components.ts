import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

interface IComponentManifest {
    name: string
    version: string
    node_modules__version: string
    modified: boolean
    location: string
    scope: string
    isLinkedInComponentFile: boolean;
}

export interface IStoryblokComponentsConfig {
    componentsManifest: IComponentManifest[];
}

let customConfig: IStoryblokComponentsConfig = {
    componentsManifest: []
}

try {
    customConfig = require(path.resolve(process.cwd(), 'storyblok.components.config'))
} catch (error) {
    // default config will be used
    if (error.code !== "MODULE_NOT_FOUND") throw error
}

const defaultConfig: IStoryblokComponentsConfig = {
    componentsManifest: []
}

// const defaultConfig: IStoryblokComponentsConfig = {
//     componentsManifest: [{
//         name: "", // @scope/component-name
//         version: "0.0.1", // "0.1.0 - x.x.x"
//         node_modules__version: "0.0.1", // "0.1.0 - x.x.x"
//         modified: false, // true | false
//         location: "node_modules", // local | node_modules
//         scope: "@storyblok-components", // @storyblok-components, @my-company-components
//         isLinkedInComponentFile: false // true | false
//     }]
// }

export default {
    ...defaultConfig,
    ...customConfig,
    componentsManifest: [
        ...defaultConfig.componentsManifest,
        ...customConfig.componentsManifest
    ]
}
