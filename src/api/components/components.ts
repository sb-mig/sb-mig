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
import type { PresetFailure } from "../presets/resolvePresets.js";
import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../utils/logger.js";
import _resolvePresets, {
    resolvePresetsForSync,
} from "../presets/resolvePresets.js";
import { getAllItemsWithPagination } from "../utils/request.js";
import { checkWritten } from "../utils/write-response.js";

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
                    /**
                     *
                     * Not every endpoint in storyblok give us pagination...
                     * so only for this who paginate we want to console log amount found.
                     *
                     * */
                    if (res.total) {
                        Logger.log(`Amount of components: ${res.total}`);
                    }

                    return res;
                })
                .catch((err: any) => {
                    // A failed listing is never "no components" (MAR-3139).
                    console.error(err);
                    throw err;
                }),
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
            res.filter((component: any) => component.name === componentName),
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
    config,
) => {
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to create '${component.name}'`);
    const componentWithPresets = component;
    const { all_presets, ...componentWithoutPresets } = componentWithPresets;

    return sbApi
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
                `${err.message} in migration of ${component.name} in createComponent function`,
            );
            throw err;
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
    config,
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
                    config,
                );
            } else {
                return [];
            }
        })
        .catch((err) => {
            Logger.error(
                `${err.message} in migration of ${component.name} in updateComponent function`,
            );
        });
};

/*
 *
 * For the component sync
 *
 * The public createComponent / updateComponent / createComponentsGroup keep
 * their contracts for api-v2 callers: an update or a group that fails is
 * logged and resolves, and presets are written in the background after a
 * create. The sync needs to count every failure, so it writes through these
 * instead: a failed write rejects, and preset failures come back as data.
 *
 * */
export const createComponentForSync = async (
    component: any,
    presets: boolean,
    config: RequestBaseConfig,
): Promise<PresetFailure[]> => {
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to create '${component.name}'`);
    const { all_presets, ...componentWithoutPresets } = component;

    const res = await sbApi
        .post(`spaces/${spaceId}/components/`, {
            component: componentWithoutPresets,
        })
        .then((answer) =>
            checkWritten(
                answer,
                `create component '${component.name}'`,
                "component",
            ),
        )
        .catch((err) => {
            Logger.error(
                `${err.message} in migration of ${component.name} in createComponent function`,
            );
            throw err;
        });

    Logger.success(`Component '${component.name}' has been created.`);

    return presets
        ? await resolvePresetsForSync(res, all_presets, component, config)
        : [];
};

export const updateComponentForSync = async (
    component: any,
    presets: boolean,
    config: RequestBaseConfig,
): Promise<PresetFailure[]> => {
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to update '${component.name}' with id ${component.id}`);
    const { all_presets, ...componentWithoutPresets } = component;

    const res = await sbApi
        .put(`spaces/${spaceId}/components/${component.id}`, {
            component: componentWithoutPresets,
        })
        .then((answer) =>
            checkWritten(
                answer,
                `update component '${component.name}'`,
                "component",
            ),
        )
        .catch((err) => {
            Logger.error(
                `${err.message} in migration of ${component.name} in updateComponent function`,
            );
            throw err;
        });

    Logger.success(`Component '${component.name}' has been updated.`);

    return presets
        ? await resolvePresetsForSync(res, all_presets, component, config)
        : [];
};

/** Resolves to the created group (`{ name, uuid, ... }`); rejects on failure. */
export const createComponentsGroupForSync = (
    groupName: string,
    config: RequestBaseConfig,
): Promise<any> => {
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to create '${groupName}' group`);

    return sbApi
        .post(`spaces/${spaceId}/component_groups/`, {
            component_group: {
                name: groupName,
            },
        } as any)
        .then((res: any) => {
            const group = checkWritten(
                res,
                `create component group '${groupName}'`,
                "component_group",
            ).data.component_group;
            Logger.log(`'${groupName}' created with uuid: ${group.uuid}`);
            return group;
        })
        .catch((err: any) => {
            Logger.error(
                `Unable to create component group '${groupName}': ${err?.message ?? String(err)}`,
            );
            throw err;
        });
};

/** For the --ssot removals: a removal that is not confirmed rejects. */
export const removeComponentForSync = (
    item: any,
    kind: "components" | "component_groups",
    config: RequestBaseConfig,
): Promise<unknown> => {
    const { spaceId, sbApi } = config;
    console.log(
        `Removing '${item.name}' ${kind === "components" ? "component" : "component group"}.`,
    );

    return sbApi
        .delete(`spaces/${spaceId}/${kind}/${item.id}`, {})
        .then((res: any) => checkWritten(res, `remove '${item.name}'`));
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
        .catch((err: any) => {
            console.error(err);
            throw err;
        });
};

/*
 *
 * GET All Component Groups
 *
 * */
export const getAllComponentsGroups: GetAllComponentsGroups = async (
    config,
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
                    /**
                     *
                     * Not every endpoint in storyblok give us pagination...
                     * so only for this who paginate we want to console log amount found.
                     *
                     * */
                    if (res.total) {
                        Logger.log(`Amount of component groups: ${res.total}`);
                    }

                    return res;
                })
                .catch((err: any) => {
                    if (err?.response?.status === 404) {
                        Logger.error(
                            `There is no component groups in your Storyblok ${spaceId} space.`,
                        );
                        return {
                            data: { component_groups: [] },
                            total: 0,
                            perPage: 100,
                        };
                    }

                    console.error(err);
                    throw err;
                }),
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
    config,
) => {
    const { id, name } = componentGroup;
    const { spaceId, sbApi } = config;

    console.log(`Removing '${name}' component group.`);

    return sbApi
        .delete(`spaces/${spaceId}/component_groups/${id}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => {
            console.error(err);
            throw err;
        });
};

export const createComponentsGroup: CreateComponentsGroup = (
    groupName,
    config,
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
                `'${groupName}' created with uuid: ${res.data.component_group.uuid}`,
            );
            return res.data;
        })
        .catch((err: any) => {
            console.log(err.message);
            console.error("Error happened :()");
        });
};
