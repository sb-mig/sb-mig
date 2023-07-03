import type { RequestBaseConfig } from "../utils/request.js";

export interface Space {
    name: string;
    id: number;
    euid?: any;
    region: string;
    owner_id: number;
    updated_at: string;
    fe_version: "v2" | "v1";
    plan: "starter" | string;
    plan_level: number;
    trial: boolean;
    requires_2fa?: any;
    created_at: string;
}

export type GetSpace = (
    args: {
        spaceId: string;
    },
    config: RequestBaseConfig
) => Promise<any>;

export type GetAllSpaces = (config: RequestBaseConfig) => Promise<Space[]>;

export type UpdateSpace = (
    args: {
        spaceId: string;
        params: any;
    },
    config: RequestBaseConfig
) => Promise<any>;
