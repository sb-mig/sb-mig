"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const components_1 = require("./components");
const presets_1 = require("./presets");
exports.getComponentPresets = (componentName) => {
    logger_1.default.log(`Trying to get all '${componentName}' presets.`);
    return components_1.getAllComponents().then(async (res) => {
        const componentPresets = res.components.filter((component) => component.name === componentName);
        if (componentPresets.length > 0) {
            if (componentPresets[0].all_presets.length === 0) {
                logger_1.default.warning(`There is no presets for: '${componentName}' component`);
                return false;
            }
            else {
                return Promise.all(componentPresets[0].all_presets.map((preset) => presets_1.getPreset(preset.id).catch((err) => logger_1.default.error(err))));
            }
        }
        else {
            logger_1.default.warning(`There is no '${componentName}' component`);
            return false;
        }
    });
};
