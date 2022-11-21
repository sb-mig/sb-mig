import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";

const { spaceId, boilerplateSpaceId } = storyblokConfig;

export const getSpace = ({ spaceId }: { spaceId: number }) => {
    return sbApi
        .get(`spaces/${spaceId}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const updateSpace = ({
    spaceId,
    params,
}: {
    spaceId: number;
    params: any;
}) => {
    return sbApi
        .put(`spaces/${spaceId}`, {
            ...params,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};
