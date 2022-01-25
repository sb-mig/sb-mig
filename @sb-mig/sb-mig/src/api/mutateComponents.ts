import Logger from "../utils/logger.js";
import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";
import _resolvePresets from "./resolvePresets.js";

const { spaceId } = storyblokConfig;

// UPDATE
export const updateComponent = (component: any, presets: boolean) => {
    Logger.log(`Trying to update '${component.name}' with id ${component.id}`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;

    sbApi
        .put(`spaces/${spaceId}/components/${component.id}`, {
            component: componentWithoutPresets,
        })
        .then((res) => {
            Logger.success(`Component '${component.name}' has been updated.`);
            if (presets) {
                _resolvePresets(res, all_presets, component);
            }
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${component.name} in updateComponent function`
            );
        });
};

// CREATE
export const createComponent = (component: any, presets: boolean) => {
    Logger.log(`Trying to create '${component.name}'`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;

    sbApi
        .post(`spaces/${spaceId}/components/`, {
            component: componentWithoutPresets,
        })
        .then((res) => {
            Logger.success(`Component '${component.name}' has been created.`);
            if (presets) {
                _resolvePresets(res, all_presets, component);
            }
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${component.name} in createComponent function`
            );
        });
};
