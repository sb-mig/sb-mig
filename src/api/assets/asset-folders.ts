import type {
    CreateAssetFolder,
    GetAllAssetFolders,
} from "./asset-folders.types.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

const joinQueryValues = (values: Array<number | string> | undefined) =>
    values && values.length > 0 ? values.join(",") : undefined;

export const getAllAssetFolders: GetAllAssetFolders = async (args, config) => {
    const { spaceId, search, withParent, byIds, byUuids } = args;
    const { sbApi } = config;

    const assetFolders = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            (sbApi as any)
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
                    per_page,
                    page,
                })
                .catch((err: any) => {
                    if (err.response?.status === 404) {
                        Logger.error(
                            `There are no asset folders in your Storyblok ${spaceId} space.`,
                        );
                        return {
                            data: { asset_folders: [] },
                            total: 0,
                            perPage: 100,
                        };
                    }

                    Logger.error(err);
                    throw err;
                }),
        params: {},
        itemsKey: "asset_folders",
    });

    return { asset_folders: assetFolders };
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
