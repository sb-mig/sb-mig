import type { RequestBaseConfig } from "./utils/request";
import type { OneComponent } from "../../utils/discover";

export type GetRole = (
    roleName: string | undefined,
    config: RequestBaseConfig
) => Promise<void>;
export type GetAllRoles = (config: RequestBaseConfig) => Promise<any>;

export type CreateRole = (role: any, config: RequestBaseConfig) => void;
export type UpdateRole = (role: any, config: RequestBaseConfig) => void;

export type SyncRoles = (
    { specifiedRoles }: { specifiedRoles: OneComponent[] },
    config: RequestBaseConfig
) => Promise<void>;
export type SyncAllRoles = (config: RequestBaseConfig) => Promise<void>;
export type SyncProvidedRoles = (
    { roles }: { roles: string[] },
    config: RequestBaseConfig
) => Promise<void>;
