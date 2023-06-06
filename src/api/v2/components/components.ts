import type {
    CreateComponent,
    CreateComponentsGroup,
    GetAllComponents,
    GetAllComponentsGroups,
    GetComponent,
    GetComponentsGroup,
    RemoveComponent,
    RemoveComponentGroup,
    UpdateComponent,
} from "./components.types.js";

import Logger from "../../../utils/logger.js";

import _resolvePresets from "./../presets/resolvePresets.js";
import { getAllItemsWithPagination } from "./../utils/request.js";

/*
 *
 * GET ALL components
 *
 * */
export const getAllComponents: GetAllComponents = (config) => {
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
export const getComponent: GetComponent = (componentName, config) => {
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

// CREATE
export const createComponent: CreateComponent = (
    component,
    presets,
    config
) => {
    const { spaceId, sbApi } = config;
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
                _resolvePresets(res, all_presets, component, config);
            }
        })
        .catch((err) => {
            Logger.error(
                `${err.message} in migration of ${component.name} in createComponent function`
            );
        });
};

/*
 *
 * PUT ONE Component
 *
 * */
export const updateComponent: UpdateComponent = (
    component,
    presets,
    config
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

/*
 *
 * DEL one Component
 *
 * */
export const removeComponent: RemoveComponent = (component, config) => {
    const { id, name } = component;
    const { spaceId, sbApi } = config;
    console.log(`Removing '${name}' component.`);

    return sbApi
        .delete(`spaces/${spaceId}/components/${id}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

/*
 *
 * GET All Component Groups
 *
 * */
export const getAllComponentsGroups: GetAllComponentsGroups = async (
    config
) => {
    const { spaceId, sbApi } = config;
    Logger.log("Trying to get all groups.");

    // TODO: All Components Groups doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/component_groups/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of component groups: ${res.total}`);

                    return res;
                })
                .catch((err) => console.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "component_groups",
    });
};

export const getComponentsGroup: GetComponentsGroup = (groupName, config) => {
    console.log(`Trying to get '${groupName}' group.`);

    return getAllComponentsGroups(config)
        .then((res) => {
            return res.filter((group: any) => group.name === groupName);
        })
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                console.info(`There is no group named '${groupName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => console.error(err));
};

export const removeComponentGroup: RemoveComponentGroup = (
    componentGroup,
    config
) => {
    const { id, name } = componentGroup;
    const { spaceId, sbApi } = config;

    console.log(`Removing '${name}' component group.`);

    return sbApi
        .delete(`spaces/${spaceId}/component_groups/${id}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const createComponentsGroup: CreateComponentsGroup = (
    groupName,
    config
) => {
    const { spaceId, sbApi } = config;
    console.log(`Trying to create '${groupName}' group`);
    return sbApi
        .post(`spaces/${spaceId}/component_groups/`, {
            component_group: {
                name: groupName,
            },
        } as any)
        .then((res: any) => {
            console.info(
                `'${groupName}' created with uuid: ${res.data.component_group.uuid}`
            );
            return res.data;
        })
        .catch((err: any) => {
            console.log(err.message);
            console.error("Error happened :()");
        });
};
