import type {
    GetAllSpaces,
    GetSpace,
    Space,
    UpdateSpace,
} from "./spaces.types.js";

export const getSpace: GetSpace = (args, config) => {
    const { sbApi } = config;
    const { spaceId } = args;

    return sbApi
        .get(`spaces/${spaceId}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const getAllSpaces: GetAllSpaces = (config) => {
    const { sbApi } = config;
    return sbApi
        .get(`spaces/`)
        .then((res: any) => res.data.spaces as Space[])
        .catch((err: any) => {
            console.error(err);
            return [];
        });
};

export const updateSpace: UpdateSpace = (args, config) => {
    const { sbApi } = config;
    const { spaceId, params } = args;
    return sbApi
        .put(`spaces/${spaceId}`, {
            ...params,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};
