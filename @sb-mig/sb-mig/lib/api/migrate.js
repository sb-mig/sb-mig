"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const discover_1 = require("../utils/discover");
const config_1 = require("../config/config");
const components_1 = require("./components");
const mutateComponents_1 = require("./mutateComponents");
const { componentDirectory } = config_1.default;
const _uniqueValuesFrom = (array) => [...new Set(array)];
const _checkAndPrepareGroups = async (groupsToCheck) => {
    const componentsGroups = await components_1.getAllComponentsGroups();
    const groupExist = (groupName) => componentsGroups.component_groups.find((group) => group.name === groupName);
    groupsToCheck.forEach(async (groupName) => {
        if (!groupExist(groupName)) {
            await components_1.createComponentsGroup(groupName);
        }
    });
};
const _resolveGroups = async (component, existedGroups, remoteComponentsGroups) => {
    if (!component.component_group_name) {
        return { ...component, component_group_uuid: null };
    }
    const componentsGroup = existedGroups.find((group) => component.component_group_name === group);
    if (componentsGroup) {
        const component_group_uuid = remoteComponentsGroups.component_groups.find((remoteComponentsGroup) => remoteComponentsGroup.name === componentsGroup).uuid;
        return { ...component, component_group_uuid };
    }
};
exports.syncComponents = async (specifiedComponents, ext, presets, packageName) => {
    if (packageName) {
        specifiedComponents = discover_1.findComponentsByPackageName(ext, specifiedComponents);
    }
    logger_1.default.log(`Trying to sync specified components from '${componentDirectory}'`);
    let localComponents;
    if (ext) {
        localComponents = discover_1.findComponentsWithExt(ext);
    }
    else {
        localComponents = discover_1.findComponents(componentDirectory);
    }
    const groupsToCheck = _uniqueValuesFrom(localComponents
        .filter((component) => component.component_group_name)
        .map((component) => component.component_group_name));
    await _checkAndPrepareGroups(groupsToCheck);
    // after checkAndPrepareGroups remoteComponents will have synced groups with local groups
    // updates of the groups had to happen before creation of them, cause creation/updates of components
    // happens async, so if one component will have the same group, as other one
    // it will be race of condition kinda issue - we will never now, if the group for current processed component
    // already exist or is being created by other request
    const remoteComponents = await components_1.getAllComponents();
    let componentsToUpdate = [];
    let componentsToCreate = [];
    for (const component of localComponents) {
        const shouldBeUpdated = remoteComponents.components.find((remoteComponent) => component.name === remoteComponent.name);
        if (shouldBeUpdated) {
            componentsToUpdate.push({ id: shouldBeUpdated.id, ...component });
        }
        else {
            componentsToCreate.push(component);
        }
    }
    const componentsGroups = await components_1.getAllComponentsGroups();
    Promise.all(componentsToUpdate
        .filter((c) => {
        const temp = specifiedComponents.find((component) => component === c.name);
        if (temp) {
            specifiedComponents = specifiedComponents.filter((component) => component !== temp);
        }
        return temp;
    })
        .map((component) => _resolveGroups(component, groupsToCheck, componentsGroups))).then((res) => {
        logger_1.default.log("Components to update after check: ");
        res.map((component) => {
            logger_1.default.warning(`   ${component.name}`);
            mutateComponents_1.updateComponent(component, presets);
        });
    });
    Promise.all(componentsToCreate
        .filter((c) => {
        const temp = specifiedComponents.find((component) => component === c.name);
        return temp;
    })
        .map((component) => _resolveGroups(component, groupsToCheck, componentsGroups))).then((res) => {
        logger_1.default.log("Components to create after check: ");
        res.map((component) => {
            logger_1.default.warning(`   ${component.name}`);
            mutateComponents_1.createComponent(component, presets);
        });
    });
};
exports.syncAllComponents = (ext, presets) => {
    let specifiedComponents;
    if (ext) {
        specifiedComponents = discover_1.findComponentsWithExt(ext).map((component) => component.name);
    }
    else {
        specifiedComponents = discover_1.findComponents(componentDirectory).map((component) => component.name);
    }
    exports.syncComponents(specifiedComponents, ext, presets, false);
};
