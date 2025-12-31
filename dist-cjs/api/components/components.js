"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComponentsGroup = exports.removeComponentGroup = exports.getComponentsGroup = exports.getAllComponentsGroups = exports.removeComponent = exports.updateComponent = exports.createComponent = exports.getComponent = exports.getAllComponents = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const resolvePresets_js_1 = __importDefault(require("../presets/resolvePresets.js"));
const request_js_1 = require("../utils/request.js");
/*
 *
 * GET ALL components
 *
 * */
const getAllComponents = (config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log("Trying to get all components.");
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => sbApi
            .get(`spaces/${spaceId}/components/`, { per_page, page })
            .then((res) => {
            /**
             *
             * Not every endpoint in storyblok give us pagination...
             * so only for this who paginate we want to console log amount found.
             *
             * */
            if (res.total) {
                logger_js_1.default.log(`Amount of components: ${res.total}`);
            }
            return res;
        })
            .catch((err) => console.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "components",
    });
};
exports.getAllComponents = getAllComponents;
/*
 *
 * GET ONE component
 *
 * */
const getComponent = (componentName, config) => {
    logger_js_1.default.log(`Trying to get '${componentName}' component.`);
    return (0, exports.getAllComponents)(config)
        .then((res) => res.filter((component) => component.name === componentName))
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            console.info(`There is no component named '${componentName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => console.error(err));
};
exports.getComponent = getComponent;
// CREATE
const createComponent = (component, presets, config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Trying to create '${component.name}'`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;
    return sbApi
        .post(`spaces/${spaceId}/components/`, {
        component: componentWithoutPresets,
    })
        .then((res) => {
        logger_js_1.default.success(`Component '${component.name}' has been created.`);
        if (presets) {
            (0, resolvePresets_js_1.default)(res, all_presets, component, config);
        }
    })
        .catch((err) => {
        logger_js_1.default.error(`${err.message} in migration of ${component.name} in createComponent function`);
        throw err;
    });
};
exports.createComponent = createComponent;
/*
 *
 * PUT ONE Component
 *
 * */
const updateComponent = (component, presets, config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Trying to update '${component.name}' with id ${component.id}`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;
    return sbApi
        .put(`spaces/${spaceId}/components/${component.id}`, {
        component: componentWithoutPresets,
    })
        .then(async (res) => {
        logger_js_1.default.success(`Component '${component.name}' has been updated.`);
        if (presets) {
            return await (0, resolvePresets_js_1.default)(res, all_presets, component, config);
        }
        else {
            return [];
        }
    })
        .catch((err) => {
        logger_js_1.default.error(`${err.message} in migration of ${component.name} in updateComponent function`);
    });
};
exports.updateComponent = updateComponent;
/*
 *
 * DEL one Component
 *
 * */
const removeComponent = (component, config) => {
    const { id, name } = component;
    const { spaceId, sbApi } = config;
    console.log(`Removing '${name}' component.`);
    return sbApi
        .delete(`spaces/${spaceId}/components/${id}`, {})
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.removeComponent = removeComponent;
/*
 *
 * GET All Component Groups
 *
 * */
const getAllComponentsGroups = async (config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log("Trying to get all groups.");
    // TODO: All Components Groups doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => sbApi
            .get(`spaces/${spaceId}/component_groups/`, { per_page, page })
            .then((res) => {
            /**
             *
             * Not every endpoint in storyblok give us pagination...
             * so only for this who paginate we want to console log amount found.
             *
             * */
            if (res.total) {
                logger_js_1.default.log(`Amount of component groups: ${res.total}`);
            }
            return res;
        })
            .catch((err) => console.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "component_groups",
    });
};
exports.getAllComponentsGroups = getAllComponentsGroups;
const getComponentsGroup = (groupName, config) => {
    console.log(`Trying to get '${groupName}' group.`);
    return (0, exports.getAllComponentsGroups)(config)
        .then((res) => {
        return res.filter((group) => group.name === groupName);
    })
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            console.info(`There is no group named '${groupName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => console.error(err));
};
exports.getComponentsGroup = getComponentsGroup;
const removeComponentGroup = (componentGroup, config) => {
    const { id, name } = componentGroup;
    const { spaceId, sbApi } = config;
    console.log(`Removing '${name}' component group.`);
    return sbApi
        .delete(`spaces/${spaceId}/component_groups/${id}`, {})
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.removeComponentGroup = removeComponentGroup;
const createComponentsGroup = (groupName, config) => {
    const { spaceId, sbApi } = config;
    console.log(`Trying to create '${groupName}' group`);
    return sbApi
        .post(`spaces/${spaceId}/component_groups/`, {
        component_group: {
            name: groupName,
        },
    })
        .then((res) => {
        console.info(`'${groupName}' created with uuid: ${res.data.component_group.uuid}`);
        return res.data;
    })
        .catch((err) => {
        console.log(err.message);
        console.error("Error happened :()");
    });
};
exports.createComponentsGroup = createComponentsGroup;
