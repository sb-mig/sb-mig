import type { RequestBaseConfig } from "../utils/request.js";

export interface SBAssetFolder {
    id: number;
    name: string;
    parent_id: number | null;
    uuid?: string;
    parent_uuid?: string | null;
    [key: string]: unknown;
}

export interface SBAllAssetFoldersRequestResult {
    asset_folders: SBAssetFolder[];
}

export type GetAllAssetFolders = (
    {
        spaceId,
        search,
        withParent,
        byIds,
        byUuids,
    }: {
        spaceId: string;
        search?: string;
        withParent?: number | string;
        byIds?: Array<number | string>;
        byUuids?: string[];
    },
    config: RequestBaseConfig,
) => Promise<SBAllAssetFoldersRequestResult>;
