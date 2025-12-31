"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePresets = exports.updatePreset = exports.createPreset = exports.getAllPresets = exports.getPreset = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const request_js_1 = require("../utils/request.js");
// GET
const getPreset = (args, config) => {
    const { presetId } = args;
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Trying to get preset by id: ${presetId}`);
    return sbApi
        .get(`spaces/${spaceId}/presets/${presetId}`)
        .then((response) => response.data)
        .then((response) => {
        if (Array.isArray(response.presets)) {
            logger_js_1.default.warning(`There is no preset for '${presetId}' preset id`);
            return false;
        }
        return response;
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.getPreset = getPreset;
const getAllPresets = (config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log("Trying to get all Presets.");
    // TODO: All Presets doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page, spaceId }) => sbApi
            .get(`spaces/${spaceId}/presets/`, { per_page, page })
            .then((res) => {
            logger_js_1.default.log(`Amount of presets: ${res.total}`);
            return res;
        })
            .catch((err) => logger_js_1.default.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "presets",
    });
};
exports.getAllPresets = getAllPresets;
// CREATE
const createPreset = (p, config) => {
    const { spaceId, sbApi } = config;
    return sbApi
        .post(`spaces/${spaceId}/presets/`, {
        preset: p.preset,
    })
        .then((res) => {
        logger_js_1.default.warning(`Preset: '${p.preset.name}' has been created.`);
        return res;
    })
        .catch((e) => {
        console.log("!!!!!!!!!!");
        console.log(e);
        logger_js_1.default.error(`Error happened. Preset: '${p.preset.name}' has been not created.`);
    });
};
exports.createPreset = createPreset;
// UPDATE
const updatePreset = (args, config) => {
    const { p } = args;
    const { spaceId, sbApi } = config;
    return sbApi
        .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
        preset: p.preset,
    })
        .then((res) => {
        logger_js_1.default.warning(`Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`);
        return res;
    })
        .catch(() => {
        logger_js_1.default.error(`Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`);
    });
};
exports.updatePreset = updatePreset;
const updatePresets = (args, config) => {
    const { presets, spaceId } = args;
    return Promise.allSettled(presets.map(async (item) => {
        return (0, exports.updatePreset)({
            p: {
                preset: item,
            },
        }, { ...config, spaceId });
    }));
};
exports.updatePresets = updatePresets;
