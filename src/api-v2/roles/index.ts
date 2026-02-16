import type { ApiClient } from "../client.js";

import { getAllItemsWithPagination } from "../../api/utils/request.js";

export async function getAllRoles(client: ApiClient): Promise<any> {
    const spaceId = client.spaceId;
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            client.sbApi.get(`spaces/${spaceId}/space_roles/`, {
                per_page,
                page,
            }),
        params: {
            spaceId,
        },
        itemsKey: "space_roles",
    });
}

export async function getRole(
    client: ApiClient,
    roleName: string,
): Promise<any> {
    const roles = await getAllRoles(client);
    const match = roles.filter((r: any) => r.role === roleName);
    if (Array.isArray(match) && match.length === 0) return false;
    return match;
}

export async function createRole(client: ApiClient, role: any): Promise<any> {
    const spaceId = client.spaceId;
    return client.sbApi
        .post(`spaces/${spaceId}/space_roles/`, { space_role: role } as any)
        .then((res: any) => res.data);
}

export async function updateRole(client: ApiClient, role: any): Promise<any> {
    const spaceId = client.spaceId;
    return client.sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
            space_role: role,
        } as any)
        .then((res: any) => res.data);
}
