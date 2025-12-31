"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllComponents = getAllComponents;
exports.getComponent = getComponent;
exports.getAllComponentsGroups = getAllComponentsGroups;
exports.getComponentsGroup = getComponentsGroup;
exports.createComponentsGroup = createComponentsGroup;
exports.removeComponentGroup = removeComponentGroup;
exports.removeComponent = removeComponent;
exports.createComponent = createComponent;
exports.updateComponent = updateComponent;
const components_js_1 = require("../../api/components/components.js");
const requestConfig_js_1 = require("../requestConfig.js");
async function getAllComponents(client) {
    return await (0, components_js_1.getAllComponents)((0, requestConfig_js_1.toRequestConfig)(client));
}
async function getComponent(client, componentName) {
    return await (0, components_js_1.getComponent)(componentName, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function getAllComponentsGroups(client) {
    return await (0, components_js_1.getAllComponentsGroups)((0, requestConfig_js_1.toRequestConfig)(client));
}
async function getComponentsGroup(client, groupName) {
    return await (0, components_js_1.getComponentsGroup)(groupName, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function createComponentsGroup(client, groupName) {
    return await (0, components_js_1.createComponentsGroup)(groupName, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function removeComponentGroup(client, componentGroup) {
    return await (0, components_js_1.removeComponentGroup)(componentGroup, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function removeComponent(client, component) {
    return await (0, components_js_1.removeComponent)(component, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function createComponent(client, component, presets = false) {
    return await (0, components_js_1.createComponent)(component, presets, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function updateComponent(client, component, presets = false) {
    return await (0, components_js_1.updateComponent)(component, presets, (0, requestConfig_js_1.toRequestConfig)(client));
}
