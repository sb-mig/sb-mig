import type { SyncDirection } from "../../cli/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

export type AssetTypes = "image/png" | "image/jpg" | `${string}/${string}`;

export interface SBAsset {
    id: number;
    filename: string;
    space_id: number;
    created_at: string;
    updated_at: string;
    asset_folder_id?: number | null;
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

export interface SignedUploadPayload {
    filename: string;
    id?: number;
    asset_folder_id?: number | null;
    size?: string;
    validate_upload?: number;
}

export type CreateAssetPayload = Omit<SignedUploadPayload, "filename" | "id"> &
    Partial<Pick<SignedUploadPayload, "filename">>;

export type UpdateAssetPayload = {
    asset_folder_id?: number | null;
    internal_tag_ids?: number[];
    is_private?: boolean;
    locked?: boolean;
    meta_data?: {
        alt?: string;
        copyright?: string;
        source?: string;
        title?: string;
        [key: string]: unknown;
    };
    publish_at?: string | null;
    [key: string]: unknown;
};

export type GetAllAssets = (
    {
        spaceId,
    }: {
        spaceId: string;
        search?: string;
    },
    config: RequestBaseConfig,
) => Promise<SBAllAssetRequestResult>;
export type GetAssetByName = (
    {
        spaceId,
        fileName,
    }: {
        spaceId: string;
        fileName: string;
    },
    config: RequestBaseConfig,
) => Promise<SBAsset | undefined>;
export type GetAssetById = (
    {
        spaceId,
        assetId,
    }: {
        spaceId: string;
        assetId: number;
    },
    config: RequestBaseConfig,
) => Promise<(SBAsset & SBAssetById) | undefined>;
export type MigrateAsset = (
    {
        migrateTo,
        payload,
        syncDirection,
    }: {
        migrateTo: string;
        payload: AssetPayload;
        syncDirection: SyncDirection;
    },
    config: RequestBaseConfig,
) => Promise<boolean>;
export type CreateAsset = (
    {
        spaceId,
        pathToFile,
        payload,
    }: {
        spaceId: string;
        pathToFile: string;
        payload?: CreateAssetPayload;
    },
    config: RequestBaseConfig,
) => Promise<SignedResponseObject>;
export type CreateAssetAndFinalize = (
    {
        spaceId,
        pathToFile,
        payload,
    }: {
        spaceId: string;
        pathToFile: string;
        payload?: CreateAssetPayload;
    },
    config: RequestBaseConfig,
) => Promise<SBAsset>;
export type UpdateAsset = (
    {
        spaceId,
        assetId,
        payload,
    }: {
        spaceId: string;
        assetId: number;
        payload: UpdateAssetPayload;
    },
    config: RequestBaseConfig,
) => Promise<any>;
export type UploadFile = ({
    signedResponseObject,
    pathToFile,
}: {
    signedResponseObject: SignedResponseObject;
    pathToFile: string;
}) => Promise<void>;
export type FinalizeUpload = ({
    signedResponseObject,
}: {
    signedResponseObject: SignedResponseObject;
}) => void;

export type FinishAssetUpload = (
    {
        spaceId,
        assetId,
    }: {
        spaceId: string;
        assetId: number;
    },
    config: RequestBaseConfig,
) => Promise<{ asset: Partial<SBAsset> & Pick<SBAsset, "id" | "filename"> }>;

export type RequestSignedUploadUrl = (
    {
        spaceId,
        payload,
    }: {
        spaceId: string;
        payload: AssetPayload | SignedUploadPayload;
    },
    config: RequestBaseConfig,
) => Promise<any>;

export type DownloadAsset = (
    args: { payload: AssetPayload },
    config: RequestBaseConfig,
) => Promise<string>;
