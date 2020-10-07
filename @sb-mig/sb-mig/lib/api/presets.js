"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
const apiConfig_1 = require("./apiConfig");
const { spaceId } = config_1.default;
// GET
exports.getPreset = (presetId) => {
    logger_1.default.log(`Trying to get preset by id: ${presetId}`);
    return apiConfig_1.sbApi
        .get(`spaces/${spaceId}/presets/${presetId}`)
        .then(response => response.data)
        .then(response => {
        if (Array.isArray(response.presets)) {
            logger_1.default.warning(`There is no preset for '${presetId}' preset id`);
            return false;
        }
        return response;
    })
        .catch(err => logger_1.default.error(err));
};
exports.getAllPresets = () => {
    logger_1.default.log("Trying to get all Presets.");
    return apiConfig_1.sbApi
        .get(`spaces/${spaceId}/presets/`)
        .then(response => response.data)
        .catch(err => logger_1.default.error(err));
};
// CREATE
exports.createPreset = (p) => {
    apiConfig_1.sbApi
        .post(`spaces/${spaceId}/presets/`, {
        preset: p.preset
    })
        .then(res => {
        logger_1.default.warning(`Preset: '${p.preset.name}' has been created.`);
    })
        .catch(err => {
        logger_1.default.error(`Error happened. Preset: '${p.preset.name}' has been not created.`);
    });
};
// UPDATE
exports.updatePreset = (p) => {
    apiConfig_1.sbApi
        .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
        preset: p.preset
    })
        .then(res => {
        logger_1.default.warning(`Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`);
    })
        .catch(err => {
        logger_1.default.error(`Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`);
    });
};
