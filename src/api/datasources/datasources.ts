import storyblokConfig from "../../config/config.js";
import {
    LOOKUP_TYPE,
    SCOPE,
    discoverManyDatasources,
    discoverDatasources,
} from "../../utils/discover.js";
import Logger from "../../utils/logger.js";
import { getFilesContentWithRequire } from "../../utils/main.js";
import { sbApi } from "../config.js";
import { getAllItemsWithPagination } from "../stories.js";

import {
    createDatasourceEntries,
    getDatasourceEntries,
} from "./datasource-entries.js";

const { spaceId } = storyblokConfig;

// GET
export const getAllDatasources = () => {
    Logger.log("Trying to get all Datasources.");

    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/datasources/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of datasources: ${res.total}`);

                    return res;
                })
                .catch((err) => {
                    if (err.response.status === 404) {
                        Logger.error(
                            `There is no datasources in your Storyblok ${spaceId} space.`
                        );
                        return true;
                    } else {
                        Logger.error(err);
                        return false;
                    }
                }),
        params: {
            spaceId,
        },
        itemsKey: "datasources",
    });
};

export const getDatasource = (datasourceName: string | undefined) => {
    Logger.log(`Trying to get '${datasourceName}' datasource.`);

    return getAllDatasources()
        .then((res) => {
            if (res) {
                return res.filter(
                    (datasource: any) => datasource.name === datasourceName
                );
            } else {
                return [];
            }
        })
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(
                    `There is no datasource named '${datasourceName}'`
                );
                return false;
            }
            return res;
        })
        .catch((err) => Logger.error(err));
};

// POST
export const createDatasource = (datasource: any) => {
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
                `Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`
            );
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => Logger.error(err));
};

export const updateDatasource = (
    datasource: any,
    datasourceToBeUpdated: any
) => {
    const dimensionsToCreate = datasource.dimensions.filter(
        (dimension: { name: string; entry_value: string }) => {
            const isDimensionInRemoteDatasource =
                datasourceToBeUpdated.dimensions.find(
                    (d: { name: string; entry_value: string }) =>
                        dimension.name === d.name
                );
            return !isDimensionInRemoteDatasource;
        }
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
                `Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`
            );
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => Logger.error(err));
};

interface SyncDatasources {
    providedDatasources: string[];
}

export const syncDatasources = async ({
    providedDatasources,
}: SyncDatasources) => {
    Logger.log(`Trying to sync provided datasources: `);

    const providedDatasourcesContent = getFilesContentWithRequire({
        files: providedDatasources,
    });
    const remoteDatasources = await getAllDatasources();

    Promise.all(
        providedDatasourcesContent.map((datasource: any) => {
            const datasourceToBeUpdated = remoteDatasources.find(
                (remoteDatasource: any) =>
                    datasource.name === remoteDatasource.name
            );
            if (datasourceToBeUpdated) {
                return updateDatasource(datasource, datasourceToBeUpdated);
            }
            return createDatasource(datasource);
        })
    )
        .then((res) => {
            // After create or after update datasource
            res.map(async ({ data, datasource_entries }: any) => {
                const remoteDatasourceEntries = await getDatasourceEntries(
                    data.datasource.name
                );

                console.log(" ");
                Logger.warning(
                    `Start async syncing of '${data.datasource.name}' datasource entries.`
                );
                createDatasourceEntries(
                    data,
                    datasource_entries,
                    remoteDatasourceEntries
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

interface SyncProvidedDatasources {
    datasources: string[];
}

export const syncProvidedDatasources = ({
    datasources,
}: SyncProvidedDatasources) => {
    const allLocalDatasources = discoverManyDatasources({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: datasources,
    });

    const allExternalDatasources = discoverManyDatasources({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
        fileNames: datasources,
    });

    syncDatasources({
        providedDatasources: [
            ...allLocalDatasources,
            ...allExternalDatasources,
        ],
    });
};

export const syncAllDatasources = () => {
    const allLocalDatasources = discoverDatasources({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    const allExternalDatasources = discoverDatasources({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });

    syncDatasources({
        providedDatasources: [
            ...allLocalDatasources,
            ...allExternalDatasources,
        ],
    });
};
