import Logger from '../utils/logger'
import { findComponentsWithExt, findComponents, findComponentsByPackageName } from '../utils/discover'
import storyblokConfig from '../config/config'
import { getAllComponentsGroups, createComponentsGroup, getAllComponents } from './components'
import { updateComponent, createComponent } from './mutateComponents'

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

export const syncComponents = async (specifiedComponents: any, ext: string | false, presets: boolean, packageName: boolean) => {
    if(packageName) {
        specifiedComponents = findComponentsByPackageName(ext, specifiedComponents);
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