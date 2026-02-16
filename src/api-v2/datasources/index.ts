import type { ApiClient } from "../client.js";

import { getAllItemsWithPagination } from "../../api/utils/request.js";

export async function getAllDatasources(client: ApiClient): Promise<any> {
    const spaceId = client.spaceId;
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            client.sbApi.get(`spaces/${spaceId}/datasources/`, {
                per_page,
                page,
            }),
        params: { spaceId },
        itemsKey: "datasources",
    });
}

export async function getDatasource(
    client: ApiClient,
    datasourceName: string,
): Promise<any> {
    const datasources = await getAllDatasources(client);
    const match = datasources.filter((d: any) => d.name === datasourceName);
    if (Array.isArray(match) && match.length === 0) return false;
    return match;
}

export async function createDatasource(
    client: ApiClient,
    datasource: any,
): Promise<any> {
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
        } as any)
        .then((res: any) => res.data);
}

export async function updateDatasource(
    client: ApiClient,
    args: { datasource: any; datasourceToBeUpdated: any },
): Promise<any> {
    const spaceId = client.spaceId;
    const { datasource, datasourceToBeUpdated } = args;

    const dimensionsToCreate = (datasource.dimensions ?? []).filter(
        (dimension: { name: string }) => {
            const isDimensionInRemoteDatasource =
                datasourceToBeUpdated.dimensions?.find(
                    (d: { name: string }) => dimension.name === d.name,
                );
            return !isDimensionInRemoteDatasource;
        },
    );

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
        } as any)
        .then((res: any) => res.data);
}
