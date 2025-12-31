"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPresets = getAllPresets;
exports.getPreset = getPreset;
exports.createPreset = createPreset;
exports.updatePreset = updatePreset;
exports.updatePresets = updatePresets;
exports.getComponentPresets = getComponentPresets;
const componentPresets_js_1 = require("../../api/presets/componentPresets.js");
const presets_js_1 = require("../../api/presets/presets.js");
const requestConfig_js_1 = require("../requestConfig.js");
async function getAllPresets(client) {
    return await (0, presets_js_1.getAllPresets)((0, requestConfig_js_1.toRequestConfig)(client));
}
async function getPreset(client, presetId) {
    return await (0, presets_js_1.getPreset)({ presetId }, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function createPreset(client, preset) {
    return await (0, presets_js_1.createPreset)(preset, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function updatePreset(client, preset) {
    return await (0, presets_js_1.updatePreset)({ p: preset }, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function updatePresets(client, args) {
    return await (0, presets_js_1.updatePresets)({
        presets: args.presets,
        spaceId: args.spaceId,
        options: args.options ?? {},
    }, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function getComponentPresets(client, componentName) {
    return await (0, componentPresets_js_1.getComponentPresets)(componentName, (0, requestConfig_js_1.toRequestConfig)(client));
}
