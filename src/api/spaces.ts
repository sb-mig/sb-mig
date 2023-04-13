import { sbApi } from "./config.js";

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

export const getSpace = ({
    spaceId,
    localSbApi,
}: {
    spaceId: number;
    localSbApi: any;
}) => {
    return localSbApi
        .get(`spaces/${spaceId}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const getAllSpaces = () => {
    return sbApi
        .get(`spaces/`)
        .then((res: any) => res.data.spaces as Space[])
        .catch((err: any) => {
            console.error(err);
            return [];
        });
};

export const updateSpace = ({
    spaceId,
    params,
    localSbApi,
}: {
    spaceId: number;
    params: any;
    localSbApi: any;
}) => {
    return localSbApi
        .put(`spaces/${spaceId}`, {
            ...params,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};
