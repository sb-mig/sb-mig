import type { RequestBaseConfig } from "./utils/request.js";

export type GetAllComponents = (config: RequestBaseConfig) => Promise<any>;
export type GetComponent = (
    componentName: string | undefined,
    config: RequestBaseConfig
) => Promise<any>;
export type UpdateComponent = (
    component: any,
    preset: boolean,
    config: RequestBaseConfig
) => Promise<any>;
export type RemoveComponent = (
    component: any,
    config: RequestBaseConfig
) => Promise<any>;

export type GetAllComponentsGroups = (
    config: RequestBaseConfig
) => Promise<any>;
export type GetComponentsGroup = (
    groupName: string | undefined,
    config: RequestBaseConfig
) => Promise<any>;
export type RemoveComponentGroup = (
    componentGroup: any,
    config: RequestBaseConfig
) => Promise<any>;
export type CreateComponentsGroup = (
    groupName: string | undefined,
    config: RequestBaseConfig
) => Promise<any>;

export type RemoveSpecificComponents = (
    components: any,
    config: RequestBaseConfig
) => Promise<any>;

// Local
export type CheckAndPrepareGroups = (
    groupName: any,
    config: RequestBaseConfig
) => Promise<any>;
export type ResolveGroups = (
    component: any,
    existedGroups: any,
    remoteComponentsGroups: any,
    config: RequestBaseConfig
) => Promise<any>;
