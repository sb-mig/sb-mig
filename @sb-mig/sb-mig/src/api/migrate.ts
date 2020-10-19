import Logger from '../utils/logger'
import { findComponentsWithExt, findComponents, findComponentsByPackageName } from '../utils/discover'
import storyblokConfig from '../config/config'
import { getAllComponentsGroups, createComponentsGroup, getAllComponents } from './components'
import { updateComponent, createComponent } from './mutateComponents'
import { discoverManyByPackageName, getFileContent, OneComponent, LOOKUP_TYPE, SCOPE, compare, discover, discoverMany} from '../utils/discover2'

const { componentDirectory } = storyblokConfig;

const _uniqueValuesFrom = (array: any[]) => [...new Set(array)];

const _checkAndPrepareGroups = async (groupsToCheck: any) => {
    const componentsGroups = await getAllComponentsGroups();
    const groupExist = (groupName: any) =>
        componentsGroups.component_groups.find((group: any) => group.name === groupName);

    groupsToCheck.forEach(async (groupName: string) => {
        if (!groupExist(groupName)) {
            await createComponentsGroup(groupName);
        }
    });
};

const _resolveGroups = async (
    component: any,
    existedGroups: any,
    remoteComponentsGroups: any
) => {
    if (!component.component_group_name) {
        return { ...component, component_group_uuid: null };
    }
    const componentsGroup = existedGroups.find(
        (group: any) => component.component_group_name === group
    );
    if (componentsGroup) {
        const component_group_uuid = remoteComponentsGroups.component_groups.find(
            (remoteComponentsGroup: any) => remoteComponentsGroup.name === componentsGroup
        ).uuid;

        return { ...component, component_group_uuid };
    }
};

interface SyncComponents {
    specifiedComponents: OneComponent[],
    presets: boolean
}

export const sync2Components = async ({ specifiedComponents, presets }: SyncComponents) => {
    Logger.log(
        `sync2Components: `
    );

    const specifiedComponentsContent = specifiedComponents.map(component => getFileContent({file: component.path}))

    const groupsToCheck = _uniqueValuesFrom(
        specifiedComponentsContent
            .filter((component) => component.component_group_name)
            .map((component) => component.component_group_name)
    );

    await _checkAndPrepareGroups(groupsToCheck);

    // after checkAndPrepareGroups remoteComponents will have synced groups with local groups
    // updates of the groups had to happen before creation of them, cause creation/updates of components
    // happens async, so if one component will have the same group, as other one
    // it will be race of condition kinda issue - we will never now, if the group for current processed component
    // already exist or is being created by other request
    const remoteComponents = await getAllComponents();

    let componentsToUpdate = [];
    let componentsToCreate = [];

    for (const component of specifiedComponentsContent) {
        const shouldBeUpdated = remoteComponents.components.find(
            (remoteComponent: any) => component.name === remoteComponent.name
        );
        if (shouldBeUpdated) {
            componentsToUpdate.push({ id: shouldBeUpdated.id, ...component });
        } else {
            componentsToCreate.push(component);
        }
    }

    const componentsGroups = await getAllComponentsGroups();

    componentsToUpdate.length > 0 && Promise.all(
        componentsToUpdate
            .map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
    ).then((res) => {
        Logger.log("Components to update after check: ");
        res.map((component) => {
            Logger.warning(`   ${component.name}`);
            updateComponent(component, presets);
        });
    });

    componentsToCreate.length > 0 && Promise.all(
        componentsToCreate
            .map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
    ).then((res) => {
        Logger.log("Components to create after check: ");
        res.map((component) => {
            Logger.warning(`   ${component.name}`);
            createComponent(component, presets);
        });
    });
};

export const syncComponents = async (specifiedComponents: string[], ext: string | false, presets: boolean, packageName: boolean, local?: boolean) => {
    if(packageName) {
        specifiedComponents = findComponentsByPackageName(ext, specifiedComponents, local);
    }

    Logger.log(
        `Trying to sync specified components from '${componentDirectory}'`
    );

    let localComponents;
    if (ext) {
        localComponents = findComponentsWithExt(ext);
    } else {
        localComponents = findComponents(componentDirectory);
    }

    const groupsToCheck = _uniqueValuesFrom(
        localComponents
            .filter((component) => component.component_group_name)
            .map((component) => component.component_group_name)
    );

    await _checkAndPrepareGroups(groupsToCheck);

    // after checkAndPrepareGroups remoteComponents will have synced groups with local groups
    // updates of the groups had to happen before creation of them, cause creation/updates of components
    // happens async, so if one component will have the same group, as other one
    // it will be race of condition kinda issue - we will never now, if the group for current processed component
    // already exist or is being created by other request
    const remoteComponents = await getAllComponents();

    let componentsToUpdate = [];
    let componentsToCreate = [];

    for (const component of localComponents) {
        const shouldBeUpdated = remoteComponents.components.find(
            (remoteComponent: any) => component.name === remoteComponent.name
        );
        if (shouldBeUpdated) {
            componentsToUpdate.push({ id: shouldBeUpdated.id, ...component });
        } else {
            componentsToCreate.push(component);
        }
    }

    const componentsGroups = await getAllComponentsGroups();

    Promise.all(
        componentsToUpdate
            .filter((c) => {
                const temp = specifiedComponents.find(
                    (component: any) => component === c.name
                );
                if (temp) {
                    specifiedComponents = specifiedComponents.filter(
                        (component: any) => component !== temp
                    );
                }

                return temp;
            })
            .map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
    ).then((res) => {
        Logger.log("Components to update after check: ");
        res.map((component) => {
            Logger.warning(`   ${component.name}`);
            updateComponent(component, presets);
        });
    });

    Promise.all(
        componentsToCreate
            .filter((c) => {
                const temp = specifiedComponents.find(
                    (component: any) => component === c.name
                );
                return temp;
            })
            .map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
    ).then((res) => {
        Logger.log("Components to create after check: ");
        res.map((component) => {
            Logger.warning(`   ${component.name}`);
            createComponent(component, presets);
        });
    });
};

interface SyncAllComponents {
    presets: boolean
}

interface SyncProvidedComponents {
    presets: boolean
    components: string[]
    packageName: boolean
}

export const syncProvidedComponents = ({components, presets, packageName}: SyncProvidedComponents) => {
    if(!packageName) {
        // #1: discover all external .sb.js files
        const allLocalSbComponentsSchemaFiles = discoverMany({
            scope: SCOPE.local,
            type: LOOKUP_TYPE.fileName,
            fileNames: components
        });
        console.log(allLocalSbComponentsSchemaFiles)
        // #2: discover all local .sb.js files
        const allExternalSbComponentsSchemaFiles = discoverMany({
            scope: SCOPE.local,
            type: LOOKUP_TYPE.fileName,
            fileNames: components
        });
        // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
        const { local, external } = compare({
            local: allLocalSbComponentsSchemaFiles,
            external: allExternalSbComponentsSchemaFiles,
        });
        // #4: sync - do all stuff already done (groups resolving, and so on)
        sync2Components({ 
            presets,
            specifiedComponents: [...local, ...external] 
        });
    } else {
        // implement discovering and syncrhonizing with packageName
        // #1: discover all external .sb.js files
        const allLocalSbComponentsSchemaFiles = discoverManyByPackageName({
            scope: SCOPE.local,
            packageNames: components 
        })
        // #2: discover all local .sb.js files
        const allExternalSbComponentsSchemaFiles = discoverManyByPackageName({
            scope: SCOPE.external,
            packageNames: components
        });
        console.log("allLocalSbComponentsSchemaFiles", allLocalSbComponentsSchemaFiles)
        console.log("allExternalSbComponentsSchemaFiles", allExternalSbComponentsSchemaFiles)
        // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
        const { local, external } = compare({
            local: allLocalSbComponentsSchemaFiles,
            external: allExternalSbComponentsSchemaFiles,
        });
        // #4: sync - do all stuff already done (groups resolving, and so on)
        sync2Components({ 
            presets,
            specifiedComponents: [...local, ...external] 
        });

    }
}

export const sync2AllComponents = ({ presets }: SyncAllComponents) => {
    // #1: discover all external .sb.js files
    const allLocalSbComponentsSchemaFiles = discover({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });
    // #2: discover all local .sb.js files
    const allExternalSbComponentsSchemaFiles = discover({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });
    // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });
    // #4: sync - do all stuff already done (groups resolving, and so on)
    sync2Components({ 
        presets,
        specifiedComponents: [...local, ...external] 
    });
};

export const syncAllComponents = (ext: string | false, presets: boolean) => {
    let specifiedComponents;
    if (ext) {
        specifiedComponents = findComponentsWithExt(ext).map(
            (component) => component.name
        );
    } else {
        specifiedComponents = findComponents(componentDirectory).map((component: any) => component.name);
    }

    syncComponents(specifiedComponents, ext, presets, false);
};