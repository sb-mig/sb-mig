import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

// GET
export const getPreset = (
    presetId: string | undefined,
    config: RequestBaseConfig
) => {
    const { spaceId, sbApi } = config;
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

export const getAllPresets = (config: RequestBaseConfig) => {
    const { spaceId, sbApi } = config;
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
export const createPreset = (p: any, config: RequestBaseConfig) => {
    const { spaceId, sbApi } = config;
    return sbApi
        .post(`spaces/${spaceId}/presets/`, {
            preset: p.preset,
        } as any)
        .then((res: any) => {
            Logger.warning(`Preset: '${p.preset.name}' has been created.`);
            return res;
        })
        .catch((e) => {
            console.log("!!!!!!!!!!");
            console.log(e);
            Logger.error(
                `Error happened. Preset: '${p.preset.name}' has been not created.`
            );
        });
};

// UPDATE
export const updatePreset = (p: any, config: RequestBaseConfig) => {
    const { spaceId, sbApi } = config;
    return sbApi
        .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
            preset: p.preset,
        } as any)
        .then((res: any) => {
            Logger.warning(
                `Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`
            );
            return res;
        })
        .catch(() => {
            Logger.error(
                `Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`
            );
        });
};
