"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComponentPresets = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const components_js_1 = require("../components/components.js");
const presets_js_1 = require("./presets.js");
const getComponentPresets = (componentName, config) => {
    logger_js_1.default.log(`Trying to get all '${componentName}' presets.`);
    return (0, components_js_1.getAllComponents)(config).then(async (res) => {
        const componentPresets = res.filter((component) => component.name === componentName);
        if (componentPresets.length > 0) {
            if (componentPresets[0].all_presets.length === 0) {
                logger_js_1.default.warning(`There is no presets for: '${componentName}' component`);
                return false;
            }
            return Promise.all(componentPresets[0].all_presets.map((preset) => (0, presets_js_1.getPreset)({ presetId: preset.id }, config).catch((err) => logger_js_1.default.error(err))));
        }
        logger_js_1.default.warning(`There is no '${componentName}' component`);
        return false;
    });
};
exports.getComponentPresets = getComponentPresets;
