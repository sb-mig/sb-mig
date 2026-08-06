import type {
    CreateRole,
    GetAllRoles,
    GetRole,
    UpdateRole,
} from "./roles.types.js";
import type { SyncResult } from "../sync/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { configToClient } from "../../api-v2/requestConfig.js";
import {
    createRole as createRoleV2,
    getAllRoles as getAllRolesV2,
    getRole as getRoleV2,
    syncRoles as syncRolesV2,
    updateRole as updateRoleV2,
} from "../../api-v2/roles/index.js";

/*
 * Strategy-B shim layer (S1 pilot).
 *
 * The canonical roles implementation now lives in `api-v2/roles`. These legacy
 * config-based exports delegate to it via `configToClient`, keeping every existing
 * caller (CLI, managementApi, backup) on the exact same code path while the data
 * logic lives in the SDK layer. See SDK-REFACTOR.md (S1).
 *
 * The file-based sync wrapper still lives in `roles.sync.ts`.
 */

// POST
export const createRole: CreateRole = (role: any, config) => {
    return createRoleV2(configToClient(config), role);
};

// PUT
export const updateRole: UpdateRole = (role, config) => {
    return updateRoleV2(configToClient(config), role);
};

// GET all
export const getAllRoles: GetAllRoles = (config) => {
    return getAllRolesV2(configToClient(config));
};

// GET one
export const getRole: GetRole = (roleName, config) => {
    return getRoleV2(configToClient(config), roleName);
};

// Data-only sync
export const syncRolesData = (
    { roles, dryRun }: { roles: any[]; dryRun?: boolean },
    config: RequestBaseConfig,
): Promise<SyncResult> => {
    return syncRolesV2(configToClient(config), { roles, dryRun });
};
