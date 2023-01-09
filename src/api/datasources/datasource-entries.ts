import Logger from "../../utils/logger.js";
import { sbApi } from "../config.js";
import { getDatasource } from "./datasources.js";
import storyblokConfig from "../../config/config.js";
import { isObjectEmpty } from "../../utils/main.js";
import chalk from "chalk";

const { spaceId } = storyblokConfig;

const _decorateWithDimensions = async (
    currentDatasource: any,
    dimensionsData: any,
    _callback: any
) => {
    // callback for create or update
    const response = await _callback();

    const dimensionValueEntries = Object.entries(
        dimensionsData.dimensionValues
    );

    return dimensionValueEntries.map(([name, value]) => {
        const { id: dimension_id } = dimensionsData.datasourceDimensions.find(
            (dimension: any) => dimension.name === name
        );

        const params = {
            datasource_entry: {
                ...dimensionsData.finalDatasource_entry,
                id: response.datasource_entry.id,
                dimension_value: value,
            },
            dimension_id,
        };

        return sbApi
            .put(
                `spaces/${spaceId}/datasource_entries/${response.datasource_entry.id}`,
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

export const getDatasourceEntries = async (datasourceName: string) => {
    Logger.log(`Trying to get '${datasourceName}' datasource entries.`);

    const data = await getDatasource(datasourceName); // TODO: maybe this step is not needed, i think we can retrieve entries directly using slug (but using delivery api, not management)

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

export const createDatasourceEntries = (
    data: any,
    datasource_entries: any,
    remoteDatasourceEntries: any
) => {
    Promise.all(
        datasource_entries.map((datasourceEntry: any) => {
            const datasourceEntriesToBeUpdated =
                remoteDatasourceEntries.datasource_entries.find(
                    (remoteDatasourceEntry: any) =>
                        remoteDatasourceEntry.name ===
                        Object.values(datasourceEntry)[0]
                );
            if (datasourceEntriesToBeUpdated) {
                return updateDatasourceEntry(
                    data,
                    datasourceEntry,
                    datasourceEntriesToBeUpdated
                );
            }
            return createDatasourceEntry(data, datasourceEntry);
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

const _createDatasourceEntry = (
    currentDatasource: any,
    finalDatasource_entry: any
) => {
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

export const createDatasourceEntry = (data: any, datasourceEntry: any) => {
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
    };

    if (isObjectEmpty(datasourceEntry.dimension_values)) {
        return _createDatasourceEntry(data, finalDatasource_entry);
    } else {
        return _decorateWithDimensions(
            data,
            {
                finalDatasource_entry,
                dimensionValues: datasourceEntry.dimension_values,
                datasourceDimensions: data.datasource.dimensions,
            },
            () => _createDatasourceEntry(data, finalDatasource_entry)
        );
    }
};

const _updateDatasourceEntry = (
    currentDatasource: any,
    finalDatasource_entry: any
) => {
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
export const updateDatasourceEntry = (
    data: any,
    datasourceEntry: any,
    datasourceToBeUpdated: any
) => {
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
        id: datasourceToBeUpdated.id,
    };

    if (isObjectEmpty(datasourceEntry.dimension_values)) {
        return _updateDatasourceEntry(data, finalDatasource_entry);
    } else {
        return _decorateWithDimensions(
            data,
            {
                finalDatasource_entry,
                dimensionValues: datasourceEntry.dimension_values,
                datasourceDimensions: data.datasource.dimensions,
            },
            () => _updateDatasourceEntry(data, finalDatasource_entry)
        );
    }
};
