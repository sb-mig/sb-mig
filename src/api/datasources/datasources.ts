import type {
    CreateDatasource,
    GetAllDatasources,
    GetDatasource,
    SyncDatasources,
    UpdateDatasource,
} from "./datasources.types.js";

import Logger from "../../utils/logger.js";
import {
    getFileContentWithRequire,
    getFilesContentWithRequire,
} from "../../utils/main.js";
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

export const syncDatasources: SyncDatasources = async (args, config) => {
    const { providedDatasources } = args;
    Logger.log(`Trying to sync provided datasources: `);

    const providedDatasourcesContent = await Promise.all(
        providedDatasources.map((datasource) => {
            return getFileContentWithRequire({ file: datasource.p });
        }),
    );

    const remoteDatasources = await getAllDatasources(config);

    Promise.all(
        providedDatasourcesContent.map((datasource: any) => {
            const datasourceToBeUpdated = remoteDatasources.find(
                (remoteDatasource: any) =>
                    datasource.name === remoteDatasource.name,
            );
            if (datasourceToBeUpdated) {
                return updateDatasource(
                    { datasource: datasource, datasourceToBeUpdated },
                    config,
                );
            }
            return createDatasource({ datasource: datasource }, config);
        }),
    )
        .then((res) => {
            // After create or after update datasource
            res.map(async ({ data, datasource_entries }: any) => {
                const remoteDatasourceEntries = await getDatasourceEntries(
                    {
                        datasourceName: data.datasource.name,
                    },
                    config,
                );

                console.log(" ");
                Logger.warning(
                    `Start async syncing of '${data.datasource.name}' datasource entries.`,
                );
                createDatasourceEntries(
                    {
                        data,
                        datasource_entries,
                        remoteDatasourceEntries,
                    },
                    config,
                );
            });
            return res;
        })
        .catch((err) => {
            console.log(err);
            Logger.warning("There is error inside promise.all from datasource");
            return false;
        });
};
