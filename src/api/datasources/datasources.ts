import type {
    CreateDatasource,
    GetAllDatasources,
    GetDatasource,
    SyncDatasources,
    UpdateDatasource,
} from "./datasources.types.js";
import type { DatasourcePlan } from "../sync/sync-plan.js";
import type { SyncError, SyncResult } from "../sync/sync.types.js";

import Logger from "../../utils/logger.js";
import { planDatasource } from "../sync/sync-plan.js";
import { getAllItemsWithPagination } from "../utils/request.js";

import {
    createDatasourceEntries,
    getDatasourceDimensionValues,
    getDatasourceEntries,
} from "./datasource-entries.js";
import { formatDatasourceApiError } from "./error-formatting.js";

// GET
export const getAllDatasources: GetAllDatasources = (config) => {
    const { sbApi, spaceId } = config;
    Logger.log("Trying to get all Datasources.");

    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }: { per_page: number; page: number }) => {
            // The page is passed on: without it every page answers with the
            // first 25 datasources again (MAR-3139).
            return sbApi
                .get(`spaces/${spaceId}/datasources/`, { per_page, page })
                .then((res) => {
                    if (res.total) {
                        Logger.log(`Amount of datasources: ${res.total}`);
                    }

                    return res;
                })
                .catch((err: any) => {
                    if (err?.response?.status === 404) {
                        Logger.error(
                            `There is no datasources in your Storyblok ${spaceId} space.`,
                        );
                        return {
                            data: { datasources: [] },
                            total: 0,
                            perPage: 100,
                        };
                    }

                    Logger.error(err);
                    throw err;
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
        .catch((err) => {
            Logger.error(
                `Unable to create datasource '${datasource.name}' with slug '${datasource.slug}'. ${formatDatasourceApiError(err)}`,
            );
            throw err;
        });
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
                `Datasource '${data.datasource.name}' with id '${data.datasource.id}' updated.`,
            );
            return {
                data,
                datasource_entries: datasource.datasource_entries,
            };
        })
        .catch((err) => {
            Logger.error(
                `Unable to update datasource '${datasource.name}' with id '${datasourceToBeUpdated.id}'. ${formatDatasourceApiError(err)}`,
            );
            throw err;
        });
};

// File-based sync wrapper lives in `datasources.sync.ts` to keep this module CJS-safe.

const asError = (name: string, error: unknown): SyncError => ({
    scope: "datasource",
    name,
    message: formatDatasourceApiError(error),
});

/**
 * Sync datasources and their entries.
 *
 * Every datasource is planned against the space first (the plan is the whole
 * dry-run). A real run then writes it; a datasource or an entry that fails is
 * recorded and the run moves on to the next one.
 */
export const syncDatasourcesData = async (
    { datasources, dryRun }: { datasources: any[]; dryRun?: boolean },
    config: any,
): Promise<SyncResult> => {
    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };
    const plans: DatasourcePlan[] = [];

    if (dryRun) {
        Logger.warning(
            "[dry-run] Datasource sync will only read remote data and report planned changes.",
        );
    }

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

        const datasourceToBeUpdated = remoteDatasources.find(
            (remoteDatasource: any) =>
                datasource.name === remoteDatasource.name,
        );

        let remoteEntries: any[] = [];

        try {
            if (datasourceToBeUpdated) {
                remoteEntries = (
                    await getDatasourceEntries(
                        {
                            datasourceName: name,
                            datasourceId: datasourceToBeUpdated.id,
                        },
                        config,
                    )
                ).datasource_entries;
            }

            plans.push(
                planDatasource({
                    local: datasource,
                    remote: datasourceToBeUpdated,
                    remoteEntries,
                    remoteDimensionValues: datasourceToBeUpdated
                        ? await getDatasourceDimensionValues(
                              {
                                  datasource: datasourceToBeUpdated,
                                  localEntries:
                                      datasource.datasource_entries ?? [],
                              },
                              config,
                          )
                        : {},
                }),
            );
        } catch (e) {
            // Without the remote state there is no honest plan, and no write.
            result.errors.push(asError(name, e));
            continue;
        }

        if (dryRun) {
            const plan = plans[plans.length - 1];
            if (datasourceToBeUpdated) result.updated.push(name);
            else result.created.push(name);
            Logger.warning(
                `[dry-run] Would ${datasourceToBeUpdated ? "update" : "create"} datasource '${name}' (${plan?.entries.length ?? 0} entries to write, ${plan?.unchangedEntries ?? 0} unchanged).`,
            );
            continue;
        }

        let opResult: any;
        try {
            opResult = datasourceToBeUpdated
                ? await updateDatasource(
                      { datasource, datasourceToBeUpdated },
                      config,
                  )
                : await createDatasource({ datasource }, config);
        } catch (e) {
            result.errors.push(asError(name, e));
            continue;
        }

        if (datasourceToBeUpdated) result.updated.push(name);
        else result.created.push(name);

        if (opResult?.data?.datasource && opResult?.datasource_entries) {
            try {
                const failures = await createDatasourceEntries(
                    {
                        data: opResult.data,
                        datasource_entries: opResult.datasource_entries,
                        remoteDatasourceEntries: {
                            datasource_entries: remoteEntries,
                        },
                    },
                    config,
                );

                for (const failure of failures ?? []) {
                    result.errors.push({
                        scope: "datasource-entry",
                        name: `${name}/${failure.name}`,
                        message: failure.message,
                    });
                }
            } catch (e) {
                result.errors.push(asError(name, e));
            }
        }
    }

    result.plan = { datasources: plans, destructive: [] };

    return result;
};
