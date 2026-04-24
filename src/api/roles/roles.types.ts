import type { OneFileElement } from "../../utils/path-utils.js";
import type { SyncOptions } from "../sync/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

export type GetRole = (
    roleName: string | undefined,
    config: RequestBaseConfig,
) => Promise<void>;
export type GetAllRoles = (config: RequestBaseConfig) => Promise<any>;

export type CreateRole = (role: any, config: RequestBaseConfig) => void;
export type UpdateRole = (role: any, config: RequestBaseConfig) => void;

export type SyncRoles = (
    {
        specifiedRoles,
        dryRun,
    }: { specifiedRoles: OneFileElement[]; dryRun?: boolean },
    config: RequestBaseConfig,
) => Promise<void>;
export type SyncAllRoles = (
    config: RequestBaseConfig,
    options?: SyncOptions,
) => Promise<void>;
export type SyncProvidedRoles = (
    { roles, dryRun }: { roles: string[]; dryRun?: boolean },
    config: RequestBaseConfig,
) => Promise<void>;
