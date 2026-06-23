import type {
    CreateAssetFolder,
    GetAllAssetFolders,
} from "./asset-folders.types.js";

import Logger from "../../utils/logger.js";

const joinQueryValues = (values: Array<number | string> | undefined) =>
    values && values.length > 0 ? values.join(",") : undefined;

export const getAllAssetFolders: GetAllAssetFolders = async (args, config) => {
    const { spaceId, search, withParent, byIds, byUuids } = args;
    const { sbApi } = config;

    return (sbApi as any)
        .get(`spaces/${spaceId}/asset_folders/`, {
            ...(search ? { search } : {}),
            ...(withParent !== undefined && withParent !== null
                ? { with_parent: String(withParent) }
                : {}),
            ...(joinQueryValues(byIds)
                ? { by_ids: joinQueryValues(byIds) }
                : {}),
            ...(joinQueryValues(byUuids)
                ? { by_uuids: joinQueryValues(byUuids) }
                : {}),
            per_page: 100,
        })
        .then(({ data }: any) => data)
        .catch((err: any) => {
            if (err.response?.status === 404) {
                Logger.error(
                    `There are no asset folders in your Storyblok ${spaceId} space.`,
                );
                return { asset_folders: [] };
            }

            Logger.error(err);
            throw err;
        });
};

export const createAssetFolder: CreateAssetFolder = async (
    { spaceId, payload },
    config,
) => {
    const { sbApi } = config;

    return (sbApi as any)
        .post(`spaces/${spaceId}/asset_folders/`, {
            asset_folder: {
                name: payload.name,
                ...(payload.parent_id === undefined
                    ? {}
                    : { parent_id: payload.parent_id }),
            },
        })
        .then(({ data }: any) => data)
        .catch((err: any) => {
            Logger.error(err);
            throw err;
        });
};
