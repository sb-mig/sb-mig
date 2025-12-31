"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const componentPresets_js_1 = require("./componentPresets.js");
const presets_js_1 = require("./presets.js");
const _resolvePresets = async (res, all_presets, component, config) => {
    const componentId = res.data.component.id;
    if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map((p) => {
            return { preset: { ...p.preset, component_id: componentId } };
        });
        logger_js_1.default.log(`Checking preset for '${component.name}' component`);
        const allRemoteComponentPresets = await (0, componentPresets_js_1.getComponentPresets)(component.name, config);
        const presetsToUpdate = [];
        const presetsToCreate = [];
        for (const componentPreset of all_presets_modified) {
            const shouldBeUpdated = allRemoteComponentPresets &&
                allRemoteComponentPresets.find((remotePreset) => componentPreset.preset.name ===
                    remotePreset.preset.name);
            if (shouldBeUpdated) {
                presetsToUpdate.push({
                    ...componentPreset,
                    preset: {
                        id: shouldBeUpdated.preset.id,
                        ...componentPreset.preset,
                    },
                });
            }
            else {
                presetsToCreate.push(componentPreset);
            }
        }
        const presetsToUpdateResult = await Promise.all(presetsToUpdate.map((preset) => {
            return (0, presets_js_1.updatePreset)({ p: preset }, config);
        }));
        const presetsToCreateResult = await Promise.all(presetsToCreate.map((preset) => {
            return (0, presets_js_1.createPreset)(preset, config);
        }));
        return [...presetsToCreateResult, presetsToUpdateResult];
    }
    else {
        logger_js_1.default.warning("There are no presets for this component.");
        return [];
    }
};
exports.default = _resolvePresets;
