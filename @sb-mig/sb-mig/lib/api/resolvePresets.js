"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const presets_1 = require("./presets");
const componentPresets_1 = require("./componentPresets");
const _resolvePresets = async (res, all_presets, component) => {
    const componentId = res.data.component.id;
    if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map((p) => {
            return { preset: { ...p.preset, component_id: componentId } };
        });
        logger_1.default.log(`Checking preset for '${component.name}' component`);
        const allRemoteComponentPresets = await componentPresets_1.getComponentPresets(component.name);
        let presetsToUpdate = [];
        let presetsToCreate = [];
        for (const componentPreset of all_presets_modified) {
            const shouldBeUpdated = allRemoteComponentPresets &&
                allRemoteComponentPresets.find((remotePreset) => componentPreset.preset.name === remotePreset.preset.name);
            if (shouldBeUpdated) {
                presetsToUpdate.push({
                    ...componentPreset,
                    preset: { id: shouldBeUpdated.preset.id, ...componentPreset.preset }
                });
            }
            else {
                presetsToCreate.push(componentPreset);
            }
        }
        presetsToUpdate.map(preset => {
            presets_1.updatePreset(preset);
        });
        presetsToCreate.map(preset => {
            presets_1.createPreset(preset);
        });
    }
    else {
        logger_1.default.warning("There are no presets for this component.");
    }
};
exports.default = _resolvePresets;
