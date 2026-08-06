import type { SyncResult } from "../../api/sync/sync.types.js";
import type { ApiClient } from "../client.js";

import { getAllItemsWithPagination } from "../../api/utils/request.js";
import Logger from "../../utils/logger.js";

/*
 * Canonical roles implementation (api-v2).
 *
 * The legacy `api/roles/roles.ts` now shims to these functions via
 * `configToClient`. Behaviour (logging, 404 handling, create/update/skip/dry-run
 * sync) is preserved 1:1 from the previous `api/roles` implementation so the CLI
 * stays byte-stable. See SDK-REFACTOR.md (S1).
 *
 * NOTE: console logging via Logger is kept for CLI parity; migrating roles to the
 * structured progress contract is tracked under F5.
 */

// GET all
export async function getAllRoles(client: ApiClient): Promise<any> {
    const { sbApi, spaceId } = client;
    Logger.log("Trying to get all roles.");

    // TODO: All Roles doesn't support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/space_roles/`, { per_page, page })
                .then((res: any) => {
                    Logger.log(`Amount of roles: ${res.total}`);
                    return res;
                })
                .catch((err: any) => {
                    if (err.response?.status === 404) {
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
}

// GET one
export async function getRole(
    client: ApiClient,
    roleName: string | undefined,
): Promise<any> {
    Logger.log(`Trying to get '${roleName}' role.`);

    return getAllRoles(client)
        .then((res: any) => res.filter((role: any) => role.role === roleName))
        .then((res: any) => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(`There is no role named '${roleName}'`);
                return false;
            }
            return res;
        })
        .catch((err: any) => Logger.error(err));
}

// POST
export async function createRole(client: ApiClient, role: any): Promise<any> {
    const { sbApi, spaceId } = client;

    return sbApi
        .post(`spaces/${spaceId}/space_roles/`, { space_role: role } as any)
        .then((res: any) => {
            Logger.success(`Role '${role.role}' has been created.`);
            return res.data;
        })
        .catch((err: any) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in createRole function`,
            );
            throw err;
        });
}

// PUT
export async function updateRole(client: ApiClient, role: any): Promise<any> {
    const { sbApi, spaceId } = client;

    return sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
            space_role: role,
        } as any)
        .then((res: any) => {
            Logger.success(`Role '${role.role}' has been updated.`);
            return res.data;
        })
        .catch((err: any) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in updateRole function`,
            );
            throw err;
        });
}

/**
 * Data-only role sync. Reconciles the provided role definitions against the
 * remote space: existing roles (matched by `role`) are updated, new ones are
 * created, invalid entries are skipped. With `dryRun` no writes happen but the
 * planned changes are still reported.
 */
export async function syncRoles(
    client: ApiClient,
    { roles, dryRun }: { roles: any[]; dryRun?: boolean },
): Promise<SyncResult> {
    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    if (dryRun) {
        Logger.warning(
            "[dry-run] Role sync will only read remote data and report planned changes.",
        );
    }

    const space_roles_raw = await getAllRoles(client);
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

    const updateResults = dryRun
        ? rolesToUpdate.map(() => ({ status: "fulfilled" as const }))
        : await Promise.allSettled(
              rolesToUpdate.map((role) => updateRole(client, role)),
          );
    updateResults.forEach((r: any, idx) => {
        const name = String(rolesToUpdate[idx]?.role ?? "unknown");
        if (dryRun) {
            Logger.warning(`[dry-run] Would update role '${name}'.`);
        }
        if (r.status === "fulfilled") result.updated.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    const createResults = dryRun
        ? rolesToCreate.map(() => ({ status: "fulfilled" as const }))
        : await Promise.allSettled(
              rolesToCreate.map((role) => createRole(client, role)),
          );
    createResults.forEach((r: any, idx) => {
        const name = String(rolesToCreate[idx]?.role ?? "unknown");
        if (dryRun) {
            Logger.warning(`[dry-run] Would create role '${name}'.`);
        }
        if (r.status === "fulfilled") result.created.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    return result;
}
