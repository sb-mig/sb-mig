// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate

import * as glob from "glob";
import * as path from "path";

import storyblokConfig from "../config/config";

export enum SCOPE {
    local = 'local',
    external = 'external',
    lock = 'lock',
    all = 'all'
}

export enum LOOKUP_TYPE {
    packagName = "packageName",
    fileName = "fileName"
}

interface DiscoverRequest {
    scope: SCOPE,
    type: LOOKUP_TYPE
}

interface DiscoverOneRequest {
    fileName: string
    scope: SCOPE,
    type: LOOKUP_TYPE
}

interface DiscoverManyRequest {
    fileNames: string[]
    scope: SCOPE,
    type: LOOKUP_TYPE
}

interface DiscoverOneByPackageNameRequest {
    packageName: string,
    scope: SCOPE
}

interface DiscoverManyByPackageNameRequest {
    packageNames: string[],
    scope: SCOPE
}

interface CompareRequest {
    local: string[],
    external: string[]
}

export interface OneComponent {
    name: string
    path: string,
}

export interface CompareResult {
    local: OneComponent[],
    external: OneComponent[]
}

type DiscoverResult = string[]

export const compare = (request: CompareRequest): CompareResult => {
    const splittedLocal = request.local.map(path => {
        return {
            name: path.split("/")[path.split("/").length-1], // last element of splited array - file name
            path,
        }
    })
    const splittedExternal = request.external.map(path => {
        return {
            name: path.split("/")[path.split("/").length-1], // last element of splited array - file name
            path,
        }
    })

    // we only want to modify external array, because we want sometimes remove stuff which are already on local (overwrite node_modules ones)
    const result = {
        local: splittedLocal,
        external: splittedExternal
            .filter(externalComponent => {
                if(splittedLocal.find(localComponent => externalComponent.name === localComponent.name)) {
                    return false
                } else {
                    return true
                }
            })
    }

    return result
}

export const discoverManyByPackageName = (request: DiscoverManyByPackageNameRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']
    let listOfPackagesJsonFiles

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY by PACKAGE - LOCAL - packageName
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file =>  request.packageNames.includes(getFileContent({ file }).name)) // filter only package.json from provided request.packageNames
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
        case SCOPE.external:
            // ### MANY by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file =>  request.packageNames.includes(getFileContent({ file }).name)) // filter only package.json from provided request.packageNames
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
        case SCOPE.all:
            // ### MANY by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file =>  request.packageNames.includes(getFileContent({ file }).name)) // filter only package.json from provided request.packageNames
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
    
        default:
            break;
    }

    return listOfFiles

}

export const discoverOneByPackageName = (request: DiscoverOneByPackageNameRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']
    let listOfPackagesJsonFiles

    switch (request.scope) {
        case SCOPE.local:
            // ### ONE by PACKAGE - LOCAL - packageName
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file => getFileContent({ file }).name === request.packageName) // filter only package.json from provided request.packageName
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
        case SCOPE.external:
            // ### ONE by PACKAGE - EXTERNAL - packageName
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file => getFileContent({ file }).name === request.packageName) // filter only package.json from provided request.packageName
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
        case SCOPE.all:
            // ### ONE by PACKAGE - ALL - packageName
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                `package.json`
            )

            listOfPackagesJsonFiles = glob.sync(pattern, { follow: true })
            
            listOfFiles = listOfPackagesJsonFiles
                .filter(file => getFileContent({ file }).name === request.packageName) // filter only package.json from provided request.packageName
                .map(file => {
                    // get path to folder in which current package.json is 
                    const fileFolderPath = file.split("/").slice(0, -1).join("/") 
                    const allStoryblokSchemaFilesWithinFolderPattern = path.join(`${fileFolderPath}`, `**`, `[^_]*.${storyblokConfig.schemaFileExt}`)

                    return glob.sync(allStoryblokSchemaFilesWithinFolderPattern, { follow: true })
                })
                .flat()
            break;
    
        default:
            break;
    }

    return listOfFiles

}

export const discoverMany = (request: DiscoverManyRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']

    const filesPattern = `${request.fileNames.length === 1 ? request.fileNames[0] : `{${request.fileNames.join(",")}}`}.${storyblokConfig.datasourceExt}`

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        
        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true })
            break;
    
        default:
            break;
    }

    return listOfFiles
};

export const discoverManyDatasources = (request: DiscoverManyRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']

    const filesPattern = `${request.fileNames.length === 1 ? request.fileNames[0] : `{${request.fileNames.join(",")}}`}.${storyblokConfig.datasourceExt}`


    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        
        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true })
            break;
    
        default:
            break;
    }

    return listOfFiles
};

export const discoverDatasources = (request: DiscoverRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern
    let listOfFiles = ['']

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.datasourceExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        default:
            break;
    }

    return listOfFiles
};

export const discoverOne = (request: DiscoverOneRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']

    switch (request.scope) {
        case SCOPE.local:
            // ### ONE - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `${request.fileName}.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            )
            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        
        case SCOPE.external:
            // ### ONE - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                `${request.fileName}.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            )
            listOfFiles = glob.sync(pattern, { follow: true})
            break;

        case SCOPE.all:
            // ### ONE - ALL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                `${request.fileName}.${storyblokConfig.schemaFileExt}`
            )
            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        default:
            break;
    }

    return listOfFiles
};

export const discover = (request: DiscoverRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern
    let listOfFiles = ['']

    switch (request.scope) {
        case SCOPE.local:
            // ### ALL - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        case SCOPE.external:
            // ### ALL - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        case SCOPE.all:
            // ### ALL - LOCAL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                `[^_]*.${storyblokConfig.schemaFileExt}` // all files with 'ext' extension, without files beggining with _
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        default:
            break;
    }

    return listOfFiles
};

export const discoverManyStyles = (request: DiscoverManyRequest): DiscoverResult => {
    const rootDirectory = './'
    const directory = path.resolve(process.cwd(), rootDirectory)
    let pattern;
    let listOfFiles = ['']

    const filesPattern = `${request.fileNames.length === 1 ? request.fileNames[0] : `{${request.fileNames.join(",")}}`}.scss`

    switch (request.scope) {
        case SCOPE.local:
            // ### MANY - LOCAL - fileName ###
            const onlyLocalComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => !path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyLocalComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;
        
        case SCOPE.external:
            // ### MANY - EXTERNAL - fileName ###
            const onlyNodeModulesPackagesComponentsDirectories = storyblokConfig.componentsDirectories.filter(path => path.includes("node_modules"))
            pattern = path.join(
                `${directory}/{${onlyNodeModulesPackagesComponentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true})
            break;

        case SCOPE.all:
            // ### MANY - ALL - fileName ###
            pattern = path.join(
                `${directory}/{${storyblokConfig.componentsDirectories.join(",")}}`,
                `**`,
                filesPattern
            )

            listOfFiles = glob.sync(pattern, { follow: true })
            break;
    
        default:
            break;
    }

    return listOfFiles
};

export const getFilesContent = (data: {files: string[]}) => {
    return data.files.map((file) => require(file));
}

export const getFileContent = (data: {file: string}) => {
    return require(data.file);
}
