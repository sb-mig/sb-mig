import Logger from "../utils/logger";
import storyblokConfig from "../config/config";
import { sbApi } from "./apiConfig";
import {
    LOOKUP_TYPE,
    SCOPE,
    discoverManyDatasources,
    discoverDatasources,
    getFilesContent,
} from "../utils/discover2";

const { spaceId } = storyblokConfig;

// GET
export const getAllDatasources = () => {
    Logger.log("Trying to get all Datasources.");

    return sbApi
        .get(`spaces/${spaceId}/datasources/`)
        .then(({ data }) => data)
        .catch((err) => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no datasources in your Storyblok ${spaceId} space.`
                );
            } else {
                Logger.error(err);
                return false;
            }
        });
};

export const getDatasource = (datasourceName: string) => {
    Logger.log(`Trying to get '${datasourceName}' datasource.`);

    return getAllDatasources()
        .then((res) => {
            if (res) {
                return res.datasources.filter(
                    (datasource: any) => datasource.name === datasourceName
                );
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

export const getDatasourceEntries = async (datasourceName: string) => {
    Logger.log(`Trying to get '${datasourceName}' datasource entries.`);

    const data = await getDatasource(datasourceName);

    if (data) {
        return sbApi
            .get(
                `spaces/${spaceId}/datasource_entries/?datasource_id=${data[0].id}`
            )
            .then(async ({ data }) => data)
            .catch((err) => Logger.error(err));
    }
};

export const createDatasource = (datasource: any) =>
    sbApi
        .post(`spaces/${spaceId}/datasources/`, {
            datasource: {
                name: datasource.name,
                slug: datasource.slug,
            },
        })
        .then(({ data }) => ({
            data,
            datasource_entries: datasource.datasource_entries,
        }))
        .catch((err) => Logger.error(err));

export const createDatasourceEntry = (
    datasourceEntry: any,
    datasourceId: string
) => {
    return sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
            datasource_entry: {
                name: Object.values(datasourceEntry)[0],
                value: Object.values(datasourceEntry)[1],
                datasource_id: datasourceId,
            },
        })
        .then(({ data }) => {
            return data;
        })
        .catch((err) => Logger.error(err));
};

export const updateDatasourceEntry = (
    datasourceEntry: any,
    datasourceId: string,
    datasourceToBeUpdated: any
) => {
    return sbApi
        .put(
            `spaces/${spaceId}/datasource_entries/${datasourceToBeUpdated.id}`,
            {
                datasource_entry: {
                    name: Object.values(datasourceEntry)[0],
                    value: Object.values(datasourceEntry)[1],
                    datasource_id: datasourceId,
                    id: datasourceToBeUpdated.id,
                },
            }
        )
        .then(({ data }) => {
            return data;
        })
        .catch((err) => Logger.error(err));
};

export const updateDatasource = (datasource: any, temp: any) =>
    sbApi
        .put(`spaces/${spaceId}/datasources/${temp.id}`, {
            datasource: {
                id: temp.id,
                name: datasource.name,
                slug: datasource.slug,
            },
        })
        .then(({ data }) => {
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => Logger.error(err));

export const createDatasourceEntries = (
    datasourceId: string,
    datasource_entries: any,
    remoteDatasourceEntries: any
) => {
    Promise.all(
        datasource_entries.map((datasourceEntry: any) => {
            const datasourceEntriesToBeUpdated = remoteDatasourceEntries.datasource_entries.find(
                (remoteDatasourceEntry: any) =>
                    remoteDatasourceEntry.name ===
                    Object.values(datasourceEntry)[0]
            );
            if (datasourceEntriesToBeUpdated) {
                return updateDatasourceEntry(
                    datasourceEntry,
                    datasourceId,
                    datasourceEntriesToBeUpdated
                );
            } else {
                return createDatasourceEntry(datasourceEntry, datasourceId);
            }
        })
    )
        .then(({ data }: any) => {
            Logger.success(
                `Datasource entries for ${datasourceId} datasource id has been successfully synced.`
            );
            return data;
        })
        .catch((err) => Logger.error(err));
};

interface SyncDatasources {
    providedDatasources: string[];
}

export const syncDatasources = async ({
    providedDatasources,
}: SyncDatasources) => {
    Logger.log(`Trying to sync provided datasources: ${providedDatasources}`);

    const providedDatasourcesContent = getFilesContent({
        files: providedDatasources,
    });
    const remoteDatasources = await getAllDatasources();

    Promise.all(
        providedDatasourcesContent.map((datasource) => {
            const datasourceToBeUpdated = remoteDatasources.datasources.find(
                (remoteDatasource: any) =>
                    datasource.name === remoteDatasource.name
            );
            if (datasourceToBeUpdated) {
                return updateDatasource(datasource, datasourceToBeUpdated);
            } else {
                return createDatasource(datasource);
            }
        })
    )
        .then((res) => {
            res.map(async ({ data, datasource_entries }: any) => {
                const remoteDatasourceEntries = await getDatasourceEntries(
                    data.datasource.name
                );
                createDatasourceEntries(
                    data.datasource.id,
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
