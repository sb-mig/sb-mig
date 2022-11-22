// import storyblokConfig from "../config/config.js";
// import { sbApi } from "./config.js";

// const { spaceId, boilerplateSpaceId } = storyblokConfig;

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
