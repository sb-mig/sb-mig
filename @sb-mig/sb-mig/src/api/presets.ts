import Logger from "../utils/logger.js";
import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";

const { spaceId } = storyblokConfig;

// GET
export const getPreset = (presetId: string | undefined) => {
    Logger.log(`Trying to get preset by id: ${presetId}`);

    return sbApi
        .get(`spaces/${spaceId}/presets/${presetId}`)
        .then((response) => response.data)
        .then((response) => {
            if (Array.isArray(response.presets)) {
                Logger.warning(
                    `There is no preset for '${presetId}' preset id`
                );
                return false;
            }

            return response;
        })
        .catch((err) => Logger.error(err));
};

export const getAllPresets = () => {
    Logger.log("Trying to get all Presets.");

    return sbApi
        .get(`spaces/${spaceId}/presets/`)
        .then((response) => response.data)
        .catch((err) => Logger.error(err));
};

// CREATE
export const createPreset = (p: any) => {
    sbApi
        .post(`spaces/${spaceId}/presets/`, {
            preset: p.preset,
        })
        .then(() => {
            Logger.warning(`Preset: '${p.preset.name}' has been created.`);
        })
        .catch(() => {
            Logger.error(
                `Error happened. Preset: '${p.preset.name}' has been not created.`
            );
        });
};

// UPDATE
export const updatePreset = (p: any) => {
    sbApi
        .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
            preset: p.preset,
        })
        .then(() => {
            Logger.warning(
                `Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`
            );
        })
        .catch(() => {
            Logger.error(
                `Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`
            );
        });
};
