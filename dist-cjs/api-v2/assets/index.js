"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllAssets = getAllAssets;
exports.getAssetById = getAssetById;
exports.getAssetByName = getAssetByName;
async function getAllAssets(client, args) {
    const { spaceId, search } = args;
    return client.sbApi
        .get(`spaces/${spaceId}/assets/`, {
        // @ts-ignore storyblok-js-client mismatch: documentation uses `search`
        search: search ?? "",
        per_page: 100,
    })
        .then(({ data }) => data);
}
async function getAssetById(client, args) {
    const { spaceId, assetId } = args;
    return client.sbApi
        .get(`spaces/${spaceId}/assets/${assetId}`)
        .then(({ data }) => data);
}
async function getAssetByName(client, args) {
    const result = await getAllAssets(client, {
        spaceId: args.spaceId,
        search: args.fileName,
    });
    if (result?.assets?.length === 1)
        return result.assets[0];
    return undefined;
}
