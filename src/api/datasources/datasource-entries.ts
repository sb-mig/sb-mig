import type {
    _CreateDatasourceEntry,
    _UpdateDatasourceEntry,
    CreateDatasourceEntries,
    CreateDatasourceEntry,
    GetDatasourceEntries,
    UpdateDatasourceEntry,
    _DecorateWithDimensions,
} from "./datasources.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import chalk from "chalk";

import Logger from "../../utils/logger.js";
import { isObjectEmpty } from "../../utils/object-utils.js";
import { getAllItemsWithPagination } from "../utils/request.js";

import { getDatasource } from "./datasources.js";
import { formatDatasourceApiError } from "./error-formatting.js";

const _decorateWithDimensions: _DecorateWithDimensions = async (
    args,
    config,
) => {
    const { currentDatasource, dimensionsData, _callback } = args;
    const { spaceId, sbApi } = config;
    const { finalDatasource_entry } = dimensionsData;
    // callback for create or update
    const syncedEntry = await _callback();

    // On the create path the local entry has no id yet, so the entry the
    // callback just wrote is the only place the dimension PUTs can read it from.
    const entryId =
        syncedEntry?.datasource_entry?.id ?? finalDatasource_entry.id;

    const dimensionValueEntries = Object.entries(
        dimensionsData.dimensionValues,
    );

    if (entryId === undefined || entryId === null) {
        return dimensionValueEntries.map(([name]) => {
            Logger.warning(
                `Skipping dimension value for '${finalDatasource_entry.name}' and dimension '${name}' in '${currentDatasource.datasource.name}' datasource, because the entry has no id.`,
            );
            return false;
        });
    }

    const writes = dimensionValueEntries.map(([name, value]) => {
        const data = dimensionsData.datasourceDimensions.find(
            (dimension: any) => dimension.name === name,
        );

        const params = {
            datasource_entry: {
                ...finalDatasource_entry,
                id: entryId,
                dimension_value: value,
            },
            dimension_id: data.id,
        };

        return sbApi
            .put(
                `spaces/${spaceId}/datasource_entries/${entryId}`,
                params as any,
            )
            .then((_: any) => {
                console.log(
                    `${chalk.green(
                        "✓ Datasource Entry Dimension value for",
                    )} ${chalk.blue(
                        finalDatasource_entry.name,
                    )} and dimension ${chalk.blue(name)} in ${chalk.red(
                        currentDatasource.datasource.name,
                    )} datasource ${chalk.green("was successfully updated.")}`,
                );
                return true;
            })
            .catch((err) => {
                Logger.error(
                    `Unable to set dimension '${name}' of datasource entry '${finalDatasource_entry.name}' in ${currentDatasource.datasource.name} datasource. ${formatDatasourceApiError(err)}`,
                );
                throw new Error(
                    `dimension '${name}': ${formatDatasourceApiError(err)}`,
                );
            });
    });

    // Awaited: these writes used to be left running after the sync reported
    // success, and their failures went nowhere.
    const settled = await Promise.allSettled(writes);
    const failed = settled.flatMap((outcome) =>
        outcome.status === "rejected"
            ? [
                  outcome.reason instanceof Error
                      ? outcome.reason.message
                      : String(outcome.reason),
              ]
            : [],
    );

    if (failed.length > 0) {
        throw new Error(failed.join("; "));
    }

    return settled.map((outcome) =>
        outcome.status === "fulfilled" ? outcome.value : false,
    );
};

export const getDatasourceEntries: GetDatasourceEntries = async (
    args,
    config,
) => {
    const { datasourceName, datasourceId } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to get '${datasourceName}' datasource entries.`);

    // With the id known there is nothing to look up; the lookup also swallows
    // a failed listing, which would read as "no entries" and duplicate them.
    const id =
        datasourceId ??
        (await getDatasource({ datasourceName }, config).then((data: any) =>
            data ? data[0].id : undefined,
        )); // TODO: maybe this step is not needed, i think we can retrieve entries directly using slug (but using delivery api, not management)

    if (id !== undefined) {
        const datasourceEntries = await getAllItemsWithPagination({
            apiFn: ({ per_page, page }) =>
                sbApi.get(`spaces/${spaceId}/datasource_entries/`, {
                    datasource_id: id,
                    per_page,
                    page,
                } as any),
            params: {},
            itemsKey: "datasource_entries",
        });

        Logger.success(
            `Datasource Entries for '${datasourceName}' datasource successfully retrieved.`,
        );

        return { datasource_entries: datasourceEntries };
    }

    return { datasource_entries: [] };
};

/**
 * The dimension values the space holds for the entries we are about to sync,
 * as `dimension name -> entry name -> value`. Only dimensions that both the
 * local entries use and the remote datasource has are read: a new dimension
 * has no values yet.
 */
export const getDatasourceDimensionValues = async (
    args: { datasource: any; localEntries: any[] },
    config: RequestBaseConfig,
): Promise<Record<string, Record<string, unknown>>> => {
    const { datasource, localEntries } = args;
    const { spaceId, sbApi } = config;

    const usedDimensions = new Set(
        localEntries.flatMap((entry: any) =>
            Object.keys(entry?.dimension_values ?? {}),
        ),
    );
    const dimensions = (
        Array.isArray(datasource?.dimensions) ? datasource.dimensions : []
    ).filter((dimension: any) => usedDimensions.has(dimension?.name));

    const values: Record<string, Record<string, unknown>> = {};

    for (const dimension of dimensions) {
        const entries = await getAllItemsWithPagination({
            apiFn: ({ per_page, page }) =>
                sbApi.get(`spaces/${spaceId}/datasource_entries/`, {
                    datasource_id: datasource.id,
                    dimension: dimension.entry_value,
                    per_page,
                    page,
                } as any),
            params: {},
            itemsKey: "datasource_entries",
        });

        values[dimension.name] = Object.fromEntries(
            entries.map((entry: any) => [entry.name, entry.dimension_value]),
        );
    }

    return values;
};

/**
 * Create or update every entry. Never stops at the first failure: each one
 * that could not be written comes back as `{ name, message }`.
 */
export const createDatasourceEntries: CreateDatasourceEntries = async (
    args,
    config,
) => {
    const { datasource_entries, remoteDatasourceEntries, data, dryRun } = args;
    const remoteEntries = Array.isArray(
        remoteDatasourceEntries?.datasource_entries,
    )
        ? remoteDatasourceEntries.datasource_entries
        : [];

    const outcomes = await Promise.allSettled(
        datasource_entries.map((datasourceEntry: any) => {
            const datasourceEntryName =
                datasourceEntry.name ?? Object.values(datasourceEntry)[0];
            const datasourceToBeUpdated = remoteEntries.find(
                (remoteDatasourceEntry: any) =>
                    remoteDatasourceEntry.name === datasourceEntryName,
            );

            if (dryRun) {
                const action = datasourceToBeUpdated ? "update" : "create";
                Logger.warning(
                    `[dry-run] Would ${action} datasource entry '${datasourceEntryName}' in '${data.datasource.name}' datasource.`,
                );
                return data;
            }

            if (datasourceToBeUpdated) {
                return updateDatasourceEntry(
                    { data, datasourceEntry, datasourceToBeUpdated },
                    config,
                );
            }
            return createDatasourceEntry({ data, datasourceEntry }, config);
        }),
    );

    const failures = outcomes.flatMap((outcome, index) => {
        if (outcome.status === "fulfilled") return [];

        const entry = datasource_entries[index];
        const reason = outcome.reason;

        return [
            {
                name: String(entry?.name ?? Object.values(entry ?? {})[0]),
                message:
                    reason instanceof Error && !(reason as any).response
                        ? reason.message
                        : formatDatasourceApiError(reason),
            },
        ];
    });

    if (dryRun) {
        Logger.warning(
            `[dry-run] Datasource entries for ${data.datasource.id} datasource id were planned without API writes.`,
        );
    } else if (failures.length === 0) {
        Logger.success(
            `Datasource entries for ${data.datasource.id} datasource id has been successfully synced.`,
        );
    } else {
        Logger.error(
            `${failures.length} of ${datasource_entries.length} datasource entries for ${data.datasource.id} datasource id could not be synced.`,
        );
    }

    return failures;
};

const _createDatasourceEntry: _CreateDatasourceEntry = (args, config) => {
    const { currentDatasource, finalDatasource_entry } = args;
    const { spaceId, sbApi } = config;

    if (config.debug) {
        console.log("############# Entity to Create: ");
        console.log(finalDatasource_entry);
        console.log("################################");
    }
    return sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
            datasource_entry: finalDatasource_entry,
        } as any)
        .then(({ data }: any) => {
            console.log(
                `${chalk.green("✓ Datasource Entry")} ${chalk.blue(
                    data.datasource_entry.name,
                )} in ${chalk.red(
                    currentDatasource.datasource.name,
                )} datasource ${chalk.green("was successfully created.")}`,
            );
            return data;
        })
        .catch((err) => {
            if (config.debug) {
                console.log("Full Create error: ");
                console.log(err);
            }
            Logger.error(
                `Unable to create datasource entry '${finalDatasource_entry.name}' in ${currentDatasource.datasource.name} datasource. Value: '${finalDatasource_entry.value}'. ${formatDatasourceApiError(err)}`,
            );
            throw err;
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
            config,
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
                        config,
                    ),
            },
            config,
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
            } as any,
        )
        .then((_: any) => {
            console.log(
                `${chalk.green("✓ Datasource Entry")} ${chalk.blue(
                    finalDatasource_entry.name,
                )} in ${chalk.red(
                    currentDatasource.datasource.name,
                )} datasource ${chalk.green("was successfully updated.")}`,
            );
            return true;
        })
        .catch((err) => {
            if (config.debug) {
                console.log("Full update error: ");
                console.log(err);
            }
            Logger.error(
                `Unable to update datasource entry '${finalDatasource_entry.name}' in ${currentDatasource.datasource.name} datasource. Value: '${finalDatasource_entry.value}'. ${formatDatasourceApiError(err)}`,
            );
            throw err;
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
            config,
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
                        config,
                    ),
                dimensionsData: {
                    finalDatasource_entry,
                    dimensionValues: datasourceEntry.dimension_values,
                    datasourceDimensions: data.datasource.dimensions,
                },
            },
            config,
        );
    }
};
