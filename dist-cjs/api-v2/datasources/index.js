"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllDatasources = getAllDatasources;
exports.getDatasource = getDatasource;
exports.createDatasource = createDatasource;
exports.updateDatasource = updateDatasource;
const request_js_1 = require("../../api/utils/request.js");
async function getAllDatasources(client) {
    const spaceId = client.spaceId;
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => client.sbApi.get(`spaces/${spaceId}/datasources/`, {
            per_page,
            page,
        }),
        params: { spaceId },
        itemsKey: "datasources",
    });
}
async function getDatasource(client, datasourceName) {
    const datasources = await getAllDatasources(client);
    const match = datasources.filter((d) => d.name === datasourceName);
    if (Array.isArray(match) && match.length === 0)
        return false;
    return match;
}
async function createDatasource(client, datasource) {
    const spaceId = client.spaceId;
    const finalDatasource = {
        name: datasource.name,
        slug: datasource.slug,
        dimensions: [...(datasource.dimensions ?? [])],
        dimensions_attributes: [...(datasource.dimensions ?? [])],
    };
    return client.sbApi
        .post(`spaces/${spaceId}/datasources/`, {
        datasource: finalDatasource,
    })
        .then((res) => res.data);
}
async function updateDatasource(client, args) {
    const spaceId = client.spaceId;
    const { datasource, datasourceToBeUpdated } = args;
    const dimensionsToCreate = (datasource.dimensions ?? []).filter((dimension) => {
        const isDimensionInRemoteDatasource = datasourceToBeUpdated.dimensions?.find((d) => dimension.name === d.name);
        return !isDimensionInRemoteDatasource;
    });
    return client.sbApi
        .put(`spaces/${spaceId}/datasources/${datasourceToBeUpdated.id}`, {
        datasource: {
            id: datasourceToBeUpdated.id,
            name: datasource.name,
            slug: datasource.slug,
            dimensions: [
                ...(datasourceToBeUpdated.dimensions ?? []),
                ...dimensionsToCreate,
            ],
            dimensions_attributes: [
                ...(datasourceToBeUpdated.dimensions ?? []),
                ...dimensionsToCreate,
            ],
        },
    })
        .then((res) => res.data);
}
