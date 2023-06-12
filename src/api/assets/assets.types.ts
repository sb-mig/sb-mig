import type { RequestBaseConfig } from "../utils/request.js";

export type AssetTypes = "image/png" | "image/jpg" | `${string}/${string}`;

export interface SBAsset {
    id: number;
    filename: string;
    space_id: number;
    created_at: string;
    updated_at: string;
    asset_folder_id?: null;
    deleted_at: null;
    content_length: number;
    content_type: AssetTypes;
    alt: string;
    copyright: string;
    title: string;
    focus: string;
    ext_id: any | null;
    expire_at: any | null;
    source: string;
    internal_tag_ids: any[];
    locked: boolean;
    is_private: boolean;
    publish_at: any | null;
    meta_data: any;
    internal_tags_list: any[];
}

export interface SBAssetById {
    file: any | null;
    short_file_name: string;
    permanently_deleted: boolean;
}

export interface SBAllAssetRequestResult {
    assets: SBAsset[];
}

export type SignedResponseObject = any;
export type AssetPayload = Omit<SBAsset, "updated_at" | "created_at" | "id">;

export type GetAllAssets = (
    {
        spaceId,
    }: {
        spaceId: string;
        search?: string;
    },
    config: RequestBaseConfig
) => Promise<SBAllAssetRequestResult>;
export type GetAssetByName = (
    {
        spaceId,
        fileName,
    }: {
        spaceId: string;
        fileName: string;
    },
    config: RequestBaseConfig
) => Promise<SBAsset | undefined>;
export type GetAssetById = (
    {
        spaceId,
        assetId,
    }: {
        spaceId: string;
        assetId: number;
    },
    config: RequestBaseConfig
) => Promise<(SBAsset & SBAssetById) | undefined>;
export type MigrateAsset = (
    {
        migrateTo,
        payload,
    }: {
        migrateTo: string;
        payload: AssetPayload;
    },
    config: RequestBaseConfig
) => Promise<boolean>;
export type UploadFile = ({
    signedResponseObject,
    pathToFile,
}: {
    signedResponseObject: SignedResponseObject;
    pathToFile: string;
}) => void;
export type FinalizeUpload = ({
    signedResponseObject,
}: {
    signedResponseObject: SignedResponseObject;
}) => void;

export type RequestSignedUploadUrl = (
    {
        spaceId,
        payload,
    }: {
        spaceId: string;
        payload: AssetPayload;
    },
    config: RequestBaseConfig
) => Promise<any>;
