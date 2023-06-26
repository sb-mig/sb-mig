import type {
    CreateRole,
    GetAllRoles,
    GetRole,
    SyncRoles,
    UpdateRole,
} from "./roles.types.js";

import Logger from "../../utils/logger.js";
import { getFileContentWithRequire } from "../../utils/main.js";
import { getAllItemsWithPagination } from "../utils/request.js";

// POST
export const createRole: CreateRole = (role: any, config) => {
    const { sbApi, spaceId } = config;

    sbApi
        .post(`spaces/${spaceId}/space_roles/`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been created.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in createRole function`
            );
        });
};

// PUT
export const updateRole: UpdateRole = (role, config) => {
    const { sbApi, spaceId } = config;

    sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been updated.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in updateRole function`
            );
        });
};

// GET
export const getAllRoles: GetAllRoles = async (config) => {
    const { sbApi, spaceId } = config;
    Logger.log("Trying to get all roles.");

    // TODO: All Roles doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/space_roles/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of roles: ${res.total}`);

                    return res;
                })
                .catch((err) => {
                    if (err.response.status === 404) {
                        Logger.error(
                            `There is no roles in your Storyblok ${spaceId} space.`
                        );
                        return true;
                    } else {
                        Logger.error(err);
                        return false;
                    }
                }),
        params: {
            spaceId,
        },
        itemsKey: "space_roles",
    });
};

// GET
export const getRole: GetRole = async (
    roleName: string | undefined,
    config
) => {
    Logger.log(`Trying to get '${roleName}' role.`);

    return getAllRoles(config)
        .then((res) => res.filter((role: any) => role.role === roleName))
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(`There is no role named '${roleName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => Logger.error(err));
};

export const syncRoles: SyncRoles = async ({ specifiedRoles }, config) => {
    const specifiedRolesContent = await Promise.all(
        specifiedRoles.map((roles) =>
            getFileContentWithRequire({ file: roles.p })
        )
    );

    const space_roles = await getAllRoles(config);

    const rolesToUpdate = [];
    const rolesToCreate = [];

    for (const role of specifiedRolesContent) {
        const shouldBeUpdated = space_roles.find(
            (remoteRole: any) => role.role === remoteRole.role
        );
        if (shouldBeUpdated) {
            rolesToUpdate.push({ id: shouldBeUpdated.id, ...role });
        } else {
            rolesToCreate.push(role);
        }
    }

    rolesToUpdate.map(async (role) => {
        await updateRole(role, config);
    });

    rolesToCreate.map(async (role) => {
        await createRole(role, config);
    });
};
