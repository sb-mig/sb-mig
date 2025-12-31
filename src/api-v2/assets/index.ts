import type { ApiClient } from "../client.js";

export async function getAllAssets(
    client: ApiClient,
    args: { spaceId: string; search?: string },
): Promise<any> {
    const { spaceId, search } = args;
    return client.sbApi
        .get(`spaces/${spaceId}/assets/`, {
            // @ts-ignore storyblok-js-client mismatch: documentation uses `search`
            search: search ?? "",
            per_page: 100,
        })
        .then(({ data }: any) => data);
}

export async function getAssetById(
    client: ApiClient,
    args: { spaceId: string; assetId: number },
): Promise<any> {
    const { spaceId, assetId } = args;
    return client.sbApi
        .get(`spaces/${spaceId}/assets/${assetId}`)
        .then(({ data }: any) => data);
}

export async function getAssetByName(
    client: ApiClient,
    args: { spaceId: string; fileName: string },
): Promise<any> {
    const result = await getAllAssets(client, {
        spaceId: args.spaceId,
        search: args.fileName,
    });
    if (result?.assets?.length === 1) return result.assets[0];
    return undefined;
}
