import type { ApiClient } from "../client.js";

import {
    getCurrentUser as apiGetCurrentUser,
    hasAccessToSpace as apiHasAccessToSpace,
} from "../../api/auth/auth.js";
import { toRequestConfig } from "../requestConfig.js";

export async function getCurrentUser(client: ApiClient): Promise<any> {
    return await apiGetCurrentUser(toRequestConfig(client));
}

export async function hasAccessToSpace(
    client: ApiClient,
    spaceId: string,
): Promise<boolean> {
    return await apiHasAccessToSpace({ spaceId }, toRequestConfig(client));
}
