import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";

import { sbApi } from "./config.js";
import { getAllItemsWithPagination } from "./stories.js";

const { spaceId } = storyblokConfig;

const removeIdFromPreset = (preset: any) => {
    // TODO: probably change to some better options - deleting is very slow
    delete preset.preset.id;
    delete preset.preset.space_id;
    delete preset.preset.component_id;

    return preset;
};

// GET
export const getPreset = (presetId: string | undefined) => {
    Logger.log(`Trying to get preset by id: ${presetId}`);

    return sbApi
        .get(`spaces/${spaceId}/presets/${presetId}`)
        .then((response) => {
            return removeIdFromPreset(response.data);
        })
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

    // TODO: All Presets doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page, spaceId }) =>
            sbApi
                .get(`spaces/${spaceId}/presets/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of presets: ${res.total}`);

                    return res;
                })
                .catch((err) => Logger.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "presets",
    });
};

// CREATE
export const createPreset = (p: any) => {
    sbApi
        .post(`spaces/${spaceId}/presets/`, {
            preset: p.preset,
        } as any)
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
        } as any)
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
