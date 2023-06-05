import type { RequestBaseConfig } from "./utils/request.js";

import Logger from "../../utils/logger.js";

import _resolvePresets from "./presets/resolvePresets.js";
import { getAllItemsWithPagination } from "./utils/request.js";

/*
 *
 * GET ALL components
 *
 * */
export const getAllComponents = (config: RequestBaseConfig) => {
    const { spaceId, sbApi } = config;
    Logger.log("Trying to get all components.");

    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/components/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of components: ${res.total}`);

                    return res;
                })
                .catch((err: any) => console.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "components",
    });
};

/*
 *
 * GET ONE component
 *
 * */
export const getComponent = (
    componentName: string | undefined,
    config: RequestBaseConfig
) => {
    Logger.log(`Trying to get '${componentName}' component.`);

    return getAllComponents(config)
        .then((res) =>
            res.filter((component: any) => component.name === componentName)
        )
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                console.info(`There is no component named '${componentName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => console.error(err));
};

/*
 *
 * PUT ONE Component
 *
 * */
export const updateComponent = (
    component: any,
    presets: boolean,
    config: RequestBaseConfig
) => {
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to update '${component.name}' with id ${component.id}`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;

    return sbApi
        .put(`spaces/${spaceId}/components/${component.id}`, {
            component: componentWithoutPresets,
        })
        .then(async (res) => {
            Logger.success(`Component '${component.name}' has been updated.`);
            if (presets) {
                return await _resolvePresets(
                    res,
                    all_presets,
                    component,
                    config
                );
            } else {
                return [];
            }
        })
        .catch((err) => {
            Logger.error(
                `${err.message} in migration of ${component.name} in updateComponent function`
            );
        });
};
