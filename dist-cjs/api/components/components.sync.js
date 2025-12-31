"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncComponentsData = syncComponentsData;
const array_utils_js_1 = require("../../utils/array-utils.js");
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const object_utils_js_1 = require("../../utils/object-utils.js");
const components_js_1 = require("./components.js");
async function ensureComponentGroupsExist(groupNames, config) {
    const existing = await (0, components_js_1.getAllComponentsGroups)(config);
    const existingNames = new Set((existing ?? []).map((g) => g.name));
    for (const groupName of groupNames) {
        if (!existingNames.has(groupName)) {
            await (0, components_js_1.createComponentsGroup)(groupName, config);
        }
    }
}
function resolveGroupUuid(component, remoteGroups) {
    if (!component.component_group_name) {
        return { ...component, component_group_uuid: null };
    }
    const match = remoteGroups.find((g) => g.name === component.component_group_name);
    if (!match)
        return { ...component, component_group_uuid: null };
    return { ...component, component_group_uuid: match.uuid };
}
async function syncComponentsData(args, config) {
    const { components, presets, ssot } = args;
    const result = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };
    if (ssot) {
        const existingComponents = await (0, components_js_1.getAllComponents)(config);
        const existingGroups = await (0, components_js_1.getAllComponentsGroups)(config);
        await Promise.allSettled([
            ...(existingComponents ?? []).map((c) => (0, components_js_1.removeComponent)(c, config)),
            ...(existingGroups ?? []).map((g) => (0, components_js_1.removeComponentGroup)(g, config)),
        ]);
    }
    const nonEmptyComponents = components.filter((c) => !(0, object_utils_js_1.isObjectEmpty)(c));
    const groupsToCheck = (0, array_utils_js_1.uniqueValuesFrom)(nonEmptyComponents
        .filter((c) => c.component_group_name)
        .map((c) => c.component_group_name));
    await ensureComponentGroupsExist(groupsToCheck, config);
    const remoteComponents = await (0, components_js_1.getAllComponents)(config);
    const remoteGroups = await (0, components_js_1.getAllComponentsGroups)(config);
    const componentsToUpdate = [];
    const componentsToCreate = [];
    for (const component of nonEmptyComponents) {
        if (!component?.name) {
            result.skipped.push("unknown");
            continue;
        }
        const remote = remoteComponents.find((rc) => rc.name === component.name);
        if (remote) {
            componentsToUpdate.push({ id: remote.id, ...component });
        }
        else {
            componentsToCreate.push(component);
        }
    }
    // Resolve group uuids after ensureComponentGroupsExist
    const updatePayloads = componentsToUpdate.map((c) => resolveGroupUuid(c, remoteGroups));
    const createPayloads = componentsToCreate.map((c) => resolveGroupUuid(c, remoteGroups));
    logger_js_1.default.log("Components to update after check: ");
    const updateResults = await Promise.allSettled(updatePayloads.map((c) => (0, components_js_1.updateComponent)(c, presets, config)));
    updateResults.forEach((r, idx) => {
        const name = String(updatePayloads[idx]?.name ?? "unknown");
        if (r.status === "fulfilled")
            result.updated.push(name);
        else
            result.errors.push({ name, message: String(r.reason) });
    });
    logger_js_1.default.log("Components to create after check: ");
    const createResults = await Promise.allSettled(createPayloads.map((c) => (0, components_js_1.createComponent)(c, presets, config)));
    createResults.forEach((r, idx) => {
        const name = String(createPayloads[idx]?.name ?? "unknown");
        if (r.status === "fulfilled")
            result.created.push(name);
        else
            result.errors.push({ name, message: String(r.reason) });
    });
    return result;
}
