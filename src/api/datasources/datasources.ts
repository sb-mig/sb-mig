import type {
    CreateDatasource,
    GetAllDatasources,
    GetDatasource,
    SyncDatasources,
    UpdateDatasource,
} from "./datasources.types.js";
import type { SyncResult } from "../sync/sync.types.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

import {
    createDatasourceEntries,
    getDatasourceEntries,
} from "./datasource-entries.js";

// GET
export const getAllDatasources: GetAllDatasources = (config) => {
    const { sbApi, spaceId } = config;
    Logger.log("Trying to get all Datasources.");

    return getAllItemsWithPagination({
        // @ts-ignore
        apiFn: ({ per_page, page }) => {
            return sbApi
                .get(`spaces/${spaceId}/datasources/`)
                .then((res) => {
                    if (res.total) {
                        Logger.log(`Amount of datasources: ${res.total}`);
                    }

                    return res;
                })
                .catch((err) => {
                    if (err.response.status === 404) {
                        Logger.error(
                            `There is no datasources in your Storyblok ${spaceId} space.`,
                        );
                        return true;
                    } else {
                        Logger.error(err);
                        return false;
                    }
                });
        },
        params: {
            spaceId,
        },
        itemsKey: "datasources",
    });
};

export const getDatasource: GetDatasource = (args, config) => {
    const { datasourceName } = args;
    Logger.log(`Trying to get '${datasourceName}' datasource.`);

    return getAllDatasources(config)
        .then((res) => {
            if (res) {
                return res.filter(
                    (datasource: any) => datasource.name === datasourceName,
                );
            } else {
                return [];
            }
        })
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(
                    `There is no datasource named '${datasourceName}'`,
                );
                return false;
            }
            return res;
        })
        .catch((err) => Logger.error(err));
};

// POST
export const createDatasource: CreateDatasource = (args, config) => {
    const { datasource } = args;
    const { sbApi, spaceId } = config;

    const finalDatasource = {
        name: datasource.name,
        slug: datasource.slug,
        dimensions: [...datasource.dimensions],
        dimensions_attributes: [...datasource.dimensions],
    };

    return sbApi
        .post(`spaces/${spaceId}/datasources/`, {
            datasource: finalDatasource,
        } as any)
        .then(({ data }: any) => {
            Logger.success(
                `Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`,
            );
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => Logger.error(err));
};

export const updateDatasource: UpdateDatasource = (args, config) => {
    const { datasource, datasourceToBeUpdated } = args;
    const { sbApi, spaceId } = config;

    const dimensionsToCreate = datasource.dimensions.filter(
        (dimension: { name: string; entry_value: string }) => {
            const isDimensionInRemoteDatasource =
                datasourceToBeUpdated.dimensions.find(
                    (d: { name: string; entry_value: string }) =>
                        dimension.name === d.name,
                );
            return !isDimensionInRemoteDatasource;
        },
    );

    return sbApi
        .put(`spaces/${spaceId}/datasources/${datasourceToBeUpdated.id}`, {
            datasource: {
                id: datasourceToBeUpdated.id,
                name: datasource.name,
                slug: datasource.slug,
                dimensions: [
                    ...datasourceToBeUpdated.dimensions,
                    ...dimensionsToCreate,
                ],
                dimensions_attributes: [
                    ...datasourceToBeUpdated.dimensions,
                    ...dimensionsToCreate,
                ],
            },
        } as any)
        .then(({ data }: any) => {
            Logger.success(
                `Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`,
            );
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => Logger.error(err));
};

// File-based sync wrapper lives in `datasources.sync.ts` to keep this module CJS-safe.

export const syncDatasourcesData = async (
    { datasources }: { datasources: any[] },
    config: any,
): Promise<SyncResult> => {
    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    const remoteDatasourcesRaw = await getAllDatasources(config);
    const remoteDatasources = Array.isArray(remoteDatasourcesRaw)
        ? remoteDatasourcesRaw
        : [];

    for (const datasource of datasources) {
        const name = String(datasource?.name ?? "unknown");
        if (!datasource || typeof datasource !== "object" || !datasource.name) {
            result.skipped.push(name);
            continue;
        }

        try {
            const datasourceToBeUpdated = remoteDatasources.find(
                (remoteDatasource: any) =>
                    datasource.name === remoteDatasource.name,
            );

            const opResult = datasourceToBeUpdated
                ? await updateDatasource(
                      { datasource, datasourceToBeUpdated },
                      config,
                  )
                : await createDatasource({ datasource }, config);

            if (datasourceToBeUpdated) result.updated.push(name);
            else result.created.push(name);

            if (opResult?.data?.datasource && opResult?.datasource_entries) {
                const remoteDatasourceEntries = await getDatasourceEntries(
                    {
                        datasourceName: opResult.data.datasource.name,
                    },
                    config,
                );

                await createDatasourceEntries(
                    {
                        data: opResult.data,
                        datasource_entries: opResult.datasource_entries,
                        remoteDatasourceEntries,
                    },
                    config,
                );
            }
        } catch (e) {
            result.errors.push({ name, message: String(e) });
        }
    }

    return result;
};
