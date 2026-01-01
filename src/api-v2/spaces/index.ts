import type { ApiClient } from "../client.js";

import {
    getAllSpaces as apiGetAllSpaces,
    getSpace as apiGetSpace,
    updateSpace as apiUpdateSpace,
} from "../../api/spaces/spaces.js";
import { toRequestConfig } from "../requestConfig.js";

export async function getAllSpaces(client: ApiClient): Promise<any> {
    return await apiGetAllSpaces(toRequestConfig(client));
}

export async function getSpace(
    client: ApiClient,
    spaceId: string,
): Promise<any> {
    return await apiGetSpace({ spaceId }, toRequestConfig(client));
}

export async function updateSpace(
    client: ApiClient,
    args: { spaceId: string; params: Record<string, any> },
): Promise<any> {
    return await apiUpdateSpace(args, toRequestConfig(client));
}
