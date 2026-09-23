import type { RequestBaseConfig } from "../utils/request.js";

/** The object an internal tag can be attached to. Assets are all sb-mig reads. */
export type SBInternalTagObjectType = "asset" | "component";

export interface SBInternalTag {
    id: number;
    name: string;
    object_type?: SBInternalTagObjectType | string;
    [key: string]: unknown;
}

export interface SBAllInternalTagsRequestResult {
    internal_tags: SBInternalTag[];
}

export type GetAllInternalTags = (
    {
        spaceId,
        objectType,
        search,
    }: {
        spaceId: string;
        /** Always sent: the endpoint refuses a personal access token without it. */
        objectType: SBInternalTagObjectType;
        search?: string;
    },
    config: RequestBaseConfig,
) => Promise<SBAllInternalTagsRequestResult>;
