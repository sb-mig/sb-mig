"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
const apiConfig_1 = require("./apiConfig");
const resolvePresets_1 = require("./resolvePresets");
const { spaceId } = config_1.default;
// UPDATE
exports.updateComponent = (component, presets) => {
    logger_1.default.log(`Trying to update '${component.name}' with id ${component.id}`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;
    apiConfig_1.sbApi
        .put(`spaces/${spaceId}/components/${component.id}`, {
        component: componentWithoutPresets
    })
        .then(res => {
        logger_1.default.success(`Component '${component.name}' has been updated.`);
        if (presets) {
            resolvePresets_1.default(res, all_presets, component);
        }
    })
        .catch(err => {
        logger_1.default.error("error happened... :(");
        console.log(`${err.message} in migration of ${component.name} in updateComponent function`);
    });
};
// CREATE
exports.createComponent = (component, presets) => {
    logger_1.default.log(`Trying to create '${component.name}'`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;
    apiConfig_1.sbApi
        .post(`spaces/${spaceId}/components/`, {
        component: componentWithoutPresets
    })
        .then(res => {
        logger_1.default.success(`Component '${component.name}' has been created.`);
        if (presets) {
            resolvePresets_1.default(res, all_presets, component);
        }
    })
        .catch(err => {
        logger_1.default.error("error happened... :(");
        console.log(`${err.message} in migration of ${component.name} in createComponent function`);
    });
};
