import type {
    CreateRole,
    GetAllRoles,
    GetRole,
    UpdateRole,
} from "./roles.types.js";
import type { SyncResult } from "../sync/sync.types.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

// POST
export const createRole: CreateRole = (role: any, config) => {
    const { sbApi, spaceId } = config;

    return sbApi
        .post(`spaces/${spaceId}/space_roles/`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been created.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in createRole function`,
            );
            throw err;
        });
};

// PUT
export const updateRole: UpdateRole = (role, config) => {
    const { sbApi, spaceId } = config;

    return sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been updated.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in updateRole function`,
            );
            throw err;
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
                            `There is no roles in your Storyblok ${spaceId} space.`,
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
    config,
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

export const syncRolesData = async (
    { roles }: { roles: any[] },
    config: any,
): Promise<SyncResult> => {
    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    const space_roles_raw = await getAllRoles(config);
    const space_roles = Array.isArray(space_roles_raw) ? space_roles_raw : [];

    const rolesToUpdate: any[] = [];
    const rolesToCreate: any[] = [];

    for (const role of roles) {
        if (!role || typeof role !== "object" || !("role" in role)) {
            result.skipped.push(String((role as any)?.role ?? "unknown"));
            continue;
        }

        const shouldBeUpdated = space_roles.find(
            (remoteRole: any) => role.role === remoteRole.role,
        );
        if (shouldBeUpdated) {
            rolesToUpdate.push({ id: shouldBeUpdated.id, ...role });
        } else {
            rolesToCreate.push(role);
        }
    }

    const updateResults = await Promise.allSettled(
        rolesToUpdate.map((role) => updateRole(role, config) as any),
    );
    updateResults.forEach((r, idx) => {
        const name = String(rolesToUpdate[idx]?.role ?? "unknown");
        if (r.status === "fulfilled") result.updated.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    const createResults = await Promise.allSettled(
        rolesToCreate.map((role) => createRole(role, config) as any),
    );
    createResults.forEach((r, idx) => {
        const name = String(rolesToCreate[idx]?.role ?? "unknown");
        if (r.status === "fulfilled") result.created.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    return result;
};

// File-based sync wrapper lives in `roles.sync.ts` to keep this module CJS-safe.
