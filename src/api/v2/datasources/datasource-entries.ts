import type {
    _CreateDatasourceEntry,
    _UpdateDatasourceEntry,
    CreateDatasourceEntries,
    CreateDatasourceEntry,
    GetDatasourceEntries,
    UpdateDatasourceEntry,
    _DecorateWithDimensions,
} from "./datasources.types.js";

import chalk from "chalk";

import Logger from "../../../utils/logger.js";
import { isObjectEmpty } from "../../../utils/main.js";

import { getDatasource } from "./datasources.js";

const _decorateWithDimensions: _DecorateWithDimensions = async (
    args,
    config
) => {
    const { currentDatasource, dimensionsData, _callback } = args;
    const { spaceId, sbApi } = config;
    // callback for create or update
    await _callback();

    const dimensionValueEntries = Object.entries(
        dimensionsData.dimensionValues
    );

    return dimensionValueEntries.map(([name, value]) => {
        const data = dimensionsData.datasourceDimensions.find(
            (dimension: any) => dimension.name === name
        );

        const params = {
            datasource_entry: {
                ...dimensionsData.finalDatasource_entry,
                id: dimensionsData.finalDatasource_entry.datasource_id,
                dimension_value: value,
            },
            dimension_id: data.id,
        };

        return sbApi
            .put(
                `spaces/${spaceId}/datasource_entries/${dimensionsData.finalDatasource_entry.id}`,
                params as any
            )
            .then((_: any) => {
                console.log(
                    `${chalk.green(
                        "✓ Datasource Entry Dimension value for"
                    )} ${chalk.blue(
                        dimensionsData.finalDatasource_entry.name
                    )} and dimension ${chalk.blue(name)} in ${chalk.red(
                        currentDatasource.datasource.name
                    )} datasource ${chalk.green("was successfully updated.")}`
                );
                return true;
            })
            .catch((err) => {
                Logger.error(err);
            });
    });
};

export const getDatasourceEntries: GetDatasourceEntries = async (
    args,
    config
) => {
    const { datasourceName } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to get '${datasourceName}' datasource entries.`);

    const data = await getDatasource({ datasourceName }, config); // TODO: maybe this step is not needed, i think we can retrieve entries directly using slug (but using delivery api, not management)

    if (data) {
        return sbApi
            .get(`spaces/${spaceId}/datasource_entries/`, {
                datasource_id: data[0].id,
            } as any)
            .then(async (response: any) => {
                Logger.success(
                    `Datasource Entries for '${datasourceName}' datasource successfully retrieved.`
                );
                const { data } = response;
                return data;
            })
            .catch((err) => Logger.error(err));
    }
};

export const createDatasourceEntries: CreateDatasourceEntries = (
    args,
    config
) => {
    const { datasource_entries, remoteDatasourceEntries, data } = args;

    Promise.all(
        datasource_entries.map((datasourceEntry: any) => {
            const datasourceToBeUpdated =
                remoteDatasourceEntries.datasource_entries.find(
                    (remoteDatasourceEntry: any) =>
                        remoteDatasourceEntry.name ===
                        Object.values(datasourceEntry)[0]
                );
            if (datasourceToBeUpdated) {
                return updateDatasourceEntry(
                    { data, datasourceEntry, datasourceToBeUpdated },
                    config
                );
            }
            return createDatasourceEntry({ data, datasourceEntry }, config);
        })
    )
        .then((_: any) => {
            Logger.success(
                `Datasource entries for ${data.datasource.id} datasource id has been successfully synced.`
            );
            return data;
        })
        .catch((err) => Logger.error(err));
};

const _createDatasourceEntry: _CreateDatasourceEntry = (args, config) => {
    const { currentDatasource, finalDatasource_entry } = args;
    const { spaceId, sbApi } = config;
    return sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
            datasource_entry: finalDatasource_entry,
        } as any)
        .then(({ data }: any) => {
            console.log(
                `${chalk.green("✓ Datasource Entry")} ${chalk.blue(
                    data.datasource_entry.name
                )} in ${chalk.red(
                    currentDatasource.datasource.name
                )} datasource ${chalk.green("was successfully created.")}`
            );
            return data;
        })
        .catch((err) => {
            Logger.error(err);
        });
};

export const createDatasourceEntry: CreateDatasourceEntry = (args, config) => {
    const { datasourceEntry, data } = args;
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
    };

    if (isObjectEmpty(datasourceEntry.dimension_values)) {
        return _createDatasourceEntry(
            { currentDatasource: data, finalDatasource_entry },
            config
        );
    } else {
        return _decorateWithDimensions(
            {
                currentDatasource: data,
                dimensionsData: {
                    finalDatasource_entry,
                    dimensionValues: datasourceEntry.dimension_values,
                    datasourceDimensions: data.datasource.dimensions,
                },
                _callback: () =>
                    _createDatasourceEntry(
                        { currentDatasource: data, finalDatasource_entry },
                        config
                    ),
            },
            config
        );
    }
};

const _updateDatasourceEntry: _UpdateDatasourceEntry = (args, config) => {
    const { currentDatasource, finalDatasource_entry } = args;
    const { spaceId, sbApi } = config;
    return sbApi
        .put(
            `spaces/${spaceId}/datasource_entries/${finalDatasource_entry.id}`,
            {
                datasource_entry: finalDatasource_entry,
            } as any
        )
        .then((_: any) => {
            console.log(
                `${chalk.green("✓ Datasource Entry")} ${chalk.blue(
                    finalDatasource_entry.name
                )} in ${chalk.red(
                    currentDatasource.datasource.name
                )} datasource ${chalk.green("was successfully updated.")}`
            );
            return true;
        })
        .catch((err) => {
            Logger.error(err);
        });
};
export const updateDatasourceEntry: UpdateDatasourceEntry = (args, config) => {
    const { datasourceEntry, datasourceToBeUpdated, data } = args;
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
        id: datasourceToBeUpdated.id,
    };

    if (isObjectEmpty(datasourceEntry.dimension_values)) {
        return _updateDatasourceEntry(
            { currentDatasource: data, finalDatasource_entry },
            config
        );
    } else {
        return _decorateWithDimensions(
            {
                currentDatasource: data,
                _callback: () =>
                    _updateDatasourceEntry(
                        {
                            currentDatasource: data,
                            finalDatasource_entry,
                        },
                        config
                    ),
                dimensionsData: {
                    finalDatasource_entry,
                    dimensionValues: datasourceEntry.dimension_values,
                    datasourceDimensions: data.datasource.dimensions,
                },
            },
            config
        );
    }
};
