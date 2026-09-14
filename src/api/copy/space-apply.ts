import type {
    CopySpaceComponent,
    CopySpaceDatasource,
    CopySpaceDimension,
    CopySpaceEntry,
    CopySpaceGroup,
    CopySpaceLanguage,
    CopySpacePlan,
    CopySpacePreset,
    CopySpaceResource,
    CopySpaceSnapshot,
} from "./space.js";

import { mapWithConcurrency } from "../../utils/async-utils.js";
import Logger from "../../utils/logger.js";

import {
    buildCopySpacePlan,
    buildGroupNameMap,
    buildGroupPaths,
    mergeLanguagesForTarget,
    orderGroupsParentsFirst,
    presetMatchKey,
    remapComponentForTarget,
    remapPresetForTarget,
} from "./space.js";

/**
 * `copy space` — the half that talks to Storyblok.
 *
 * Reads go to the source space id, writes to the target space id, both through
 * the one shared client handed in. Reads throw: a read that failed quietly and
 * returned nothing would plan the target as a blank space. Writes never throw —
 * each failure is collected with its resource and name, and the run carries on,
 * so one rejected component does not strand the other 331.
 */

/** The part of `storyblok-js-client` this module uses. */
export type CopySpaceSbApi = {
    get: (path: string, params?: any) => Promise<any>;
    post: (path: string, body?: any) => Promise<any>;
    put: (path: string, body?: any) => Promise<any>;
};

export type CopySpaceFailure = {
    resource: CopySpaceResource | "entries";
    name: string;
    message: string;
};

const PER_PAGE = 100;

const readAll = async (
    sbApi: CopySpaceSbApi,
    path: string,
    itemsKey: string,
    params: Record<string, unknown> = {},
): Promise<any[]> => {
    const items: any[] = [];
    let page = 1;
    let totalPages = 1;

    do {
        const response = await sbApi.get(path, {
            ...params,
            per_page: PER_PAGE,
            page,
        });
        const batch = response?.data?.[itemsKey];

        if (!Array.isArray(batch)) {
            throw new Error(
                `Reading ${path} returned no '${itemsKey}' list, so the space cannot be planned against.`,
            );
        }

        items.push(...batch);

        const total = Number(response.total ?? 0);
        totalPages =
            total > 0
                ? Math.ceil(total / Number(response.perPage ?? PER_PAGE))
                : 1;
        page += 1;
    } while (page <= totalPages);

    return items;
};

const describeError = (error: any): string => {
    const body = error?.response?.data ?? error?.response;

    if (body && typeof body === "object") {
        return JSON.stringify(body);
    }

    if (typeof body === "string" && body.length > 0) {
        return body;
    }

    return String(error?.message ?? error);
};

/**
 * Languages live on the space itself. Storyblok's own CLI and its generated
 * Management API types read and write them as top-level `languages` and
 * `default_lang_name`; older responses nest them under `options`, so both are
 * read.
 */
const readSpaceLanguages = async (
    sbApi: CopySpaceSbApi,
    spaceId: string,
): Promise<{ languages: CopySpaceLanguage[]; defaultLangName?: string }> => {
    const response = await sbApi.get(`spaces/${spaceId}`);
    const space = response?.data?.space;

    if (!space) {
        throw new Error(
            `Reading space ${spaceId} returned no space, so its languages cannot be planned.`,
        );
    }

    const languages = space.languages ?? space.options?.languages ?? [];
    const defaultLangName =
        space.default_lang_name ?? space.options?.default_lang_name;

    return {
        languages: Array.isArray(languages) ? languages : [],
        ...(defaultLangName ? { defaultLangName } : {}),
    };
};

const readEntries = async (
    sbApi: CopySpaceSbApi,
    spaceId: string,
    datasource: CopySpaceDatasource,
): Promise<CopySpaceEntry[]> => {
    const entries: CopySpaceEntry[] = (
        await readAll(
            sbApi,
            `spaces/${spaceId}/datasource_entries/`,
            "datasource_entries",
            {
                datasource_id: datasource.id,
            },
        )
    ).map((entry) => ({ id: entry.id, name: entry.name, value: entry.value }));

    // A dimension value is only returned when the dimension is asked for, one
    // dimension per read.
    for (const dimension of datasource.dimensions ?? []) {
        const withDimension = await readAll(
            sbApi,
            `spaces/${spaceId}/datasource_entries/`,
            "datasource_entries",
            { datasource_id: datasource.id, dimension: dimension.id },
        );
        const valueByName = new Map(
            withDimension.map((entry) => [entry.name, entry.dimension_value]),
        );

        for (const entry of entries) {
            const value = valueByName.get(entry.name);

            if (value !== undefined && value !== null && value !== "") {
                entry.dimension_values = {
                    ...(entry.dimension_values ?? {}),
                    [dimension.name]: value,
                };
            }
        }
    }

    return entries;
};

/**
 * Everything the plan needs from one space, reading only what the requested
 * resources depend on. `entriesFor` limits entry reads to the datasources that
 * matter, so the target is not walked for datasources the source does not have.
 */
export const readCopySpaceSnapshot = async ({
    sbApi,
    spaceId,
    resources,
    entriesFor,
}: {
    sbApi: CopySpaceSbApi;
    spaceId: string;
    resources: CopySpaceResource[];
    entriesFor?: Set<string>;
}): Promise<CopySpaceSnapshot> => {
    const needs = (...names: CopySpaceResource[]) =>
        names.some((name) => resources.includes(name));
    const snapshot: CopySpaceSnapshot = {
        languages: [],
        groups: [],
        components: [],
        presets: [],
        datasources: [],
        entriesByDatasource: new Map(),
    };

    if (needs("languages")) {
        Object.assign(snapshot, await readSpaceLanguages(sbApi, spaceId));
    }

    if (needs("groups", "components")) {
        snapshot.groups = await readAll(
            sbApi,
            `spaces/${spaceId}/component_groups/`,
            "component_groups",
        );
    }

    if (needs("components", "presets")) {
        snapshot.components = await readAll(
            sbApi,
            `spaces/${spaceId}/components/`,
            "components",
        );
    }

    if (needs("presets")) {
        snapshot.presets = await readAll(
            sbApi,
            `spaces/${spaceId}/presets/`,
            "presets",
        );
    }

    if (needs("datasources")) {
        snapshot.datasources = await readAll(
            sbApi,
            `spaces/${spaceId}/datasources/`,
            "datasources",
        );

        for (const datasource of snapshot.datasources) {
            if (entriesFor && !entriesFor.has(datasource.name)) {
                continue;
            }

            snapshot.entriesByDatasource.set(
                datasource.name,
                await readEntries(sbApi, spaceId, datasource),
            );
        }
    }

    return snapshot;
};

/** Bounded by the configured rate limit, 4 when none is configured. */
export const resolveCopySpaceConcurrency = (rateLimit?: number): number =>
    Math.max(1, Math.floor(rateLimit ?? 4));

const parentPathOf = (groupPath: string): string | undefined => {
    const index = groupPath.lastIndexOf("/");

    return index === -1 ? undefined : groupPath.slice(0, index);
};

/**
 * Writes the plan's resources into the target, in ruled order, by name. Never
 * deletes. Returns every write that failed; an empty list is a clean run.
 */
export const applyCopySpace = async ({
    sbApi,
    targetSpaceId,
    resources,
    source,
    target,
    concurrency,
}: {
    sbApi: CopySpaceSbApi;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    source: CopySpaceSnapshot;
    target: CopySpaceSnapshot;
    concurrency: number;
}): Promise<CopySpaceFailure[]> => {
    const failures: CopySpaceFailure[] = [];
    const inScope = (resource: CopySpaceResource) =>
        resources.includes(resource);
    const base = `spaces/${targetSpaceId}`;
    const attempt = async (
        resource: CopySpaceFailure["resource"],
        name: string,
        write: () => Promise<any>,
    ): Promise<any> => {
        try {
            return await write();
        } catch (error) {
            const failure = { resource, name, message: describeError(error) };

            failures.push(failure);
            Logger.error(
                `copy space: ${resource} '${name}' was not written. ${failure.message}`,
            );

            return undefined;
        }
    };

    if (inScope("languages")) {
        const merged = mergeLanguagesForTarget({
            source: source.languages,
            target: target.languages,
        });

        await attempt("languages", "languages", () =>
            sbApi.put(base, {
                space: {
                    languages: merged.languages,
                    ...(source.defaultLangName
                        ? { default_lang_name: source.defaultLangName }
                        : {}),
                },
            }),
        );
        Logger.log(
            `copy space: languages written (${merged.add.length} added, ${merged.update.length} updated).`,
        );
    }

    let targetGroups = target.groups;

    if (inScope("groups")) {
        const sourcePaths = buildGroupPaths(source.groups);
        const targetByPath = new Map(
            [...buildGroupPaths(target.groups).entries()].map(
                ([uuid, groupPath]) => [
                    groupPath,
                    target.groups.find(
                        (group) => group.uuid === uuid,
                    ) as CopySpaceGroup,
                ],
            ),
        );
        const failedPaths = new Set<string>();

        // Sequential on purpose: a child needs its parent's target id, which
        // only exists once the parent's write has returned.
        for (const group of orderGroupsParentsFirst(source.groups)) {
            const groupPath = sourcePaths.get(group.uuid) ?? group.name;
            const parentPath = parentPathOf(groupPath);

            if (parentPath && failedPaths.has(parentPath)) {
                failedPaths.add(groupPath);
                failures.push({
                    resource: "groups",
                    name: groupPath,
                    message: `its parent group '${parentPath}' was not written, so it was not created at the root instead.`,
                });
                continue;
            }

            const body = {
                component_group: {
                    name: group.name,
                    parent_id: parentPath
                        ? (targetByPath.get(parentPath)?.id ?? null)
                        : null,
                },
            };
            const existing = targetByPath.get(groupPath);
            const response = await attempt("groups", groupPath, () =>
                existing
                    ? sbApi.put(`${base}/component_groups/${existing.id}`, body)
                    : sbApi.post(`${base}/component_groups/`, body),
            );
            const written = response?.data?.component_group;

            if (!response) {
                failedPaths.add(groupPath);
                continue;
            }

            if (!existing && written) {
                targetByPath.set(groupPath, written);
            }
        }

        Logger.log("copy space: component groups written.");
        targetGroups = await readAll(
            sbApi,
            `${base}/component_groups/`,
            "component_groups",
        );
    }

    let targetComponents = target.components;

    if (inScope("components")) {
        const groupMap = buildGroupNameMap({
            sourceGroups: source.groups,
            targetGroups,
        });
        const targetIdByName = new Map(
            target.components.map((component) => [
                component.name,
                component.id,
            ]),
        );

        await mapWithConcurrency(
            source.components,
            concurrency,
            async (component: CopySpaceComponent) => {
                const { payload } = remapComponentForTarget({
                    component,
                    groupMap,
                });
                const existingId = targetIdByName.get(component.name);

                await attempt("components", component.name, () =>
                    existingId !== undefined
                        ? sbApi.put(`${base}/components/${existingId}`, {
                              component: payload,
                          })
                        : sbApi.post(`${base}/components/`, {
                              component: payload,
                          }),
                );
            },
        );

        Logger.log("copy space: components written.");
        targetComponents = await readAll(
            sbApi,
            `${base}/components/`,
            "components",
        );
    }

    if (inScope("presets")) {
        const sourceComponentNameById = new Map(
            source.components.map((component) => [
                component.id as number,
                component.name,
            ]),
        );
        const targetComponentIdByName = new Map(
            targetComponents.map((component) => [
                component.name,
                component.id as number,
            ]),
        );
        const targetComponentNameById = new Map(
            targetComponents.map((component) => [
                component.id as number,
                component.name,
            ]),
        );
        const targetPresetIdByKey = new Map(
            target.presets.map((preset) => [
                presetMatchKey(
                    targetComponentNameById.get(preset.component_id) ?? "",
                    preset.name,
                ),
                preset.id,
            ]),
        );

        await mapWithConcurrency(
            source.presets,
            concurrency,
            async (preset: CopySpacePreset) => {
                const remap = remapPresetForTarget({
                    preset,
                    sourceComponentNameById,
                    targetComponentIdByName,
                });

                if (!remap.payload || !remap.componentName) {
                    // Planned as a skip; nothing to write.
                    return;
                }

                const label = `${remap.componentName}/${preset.name}`;
                const existingId = targetPresetIdByKey.get(
                    presetMatchKey(remap.componentName, preset.name),
                );

                await attempt("presets", label, () =>
                    existingId !== undefined
                        ? sbApi.put(`${base}/presets/${existingId}`, {
                              preset: remap.payload,
                          })
                        : sbApi.post(`${base}/presets/`, {
                              preset: remap.payload,
                          }),
                );
            },
        );

        Logger.log("copy space: presets written.");
    }

    if (inScope("datasources")) {
        const targetByName = new Map(
            target.datasources.map((datasource) => [
                datasource.name,
                datasource,
            ]),
        );

        for (const datasource of source.datasources) {
            const existing = targetByName.get(datasource.name);
            const existingDimensionNames = new Set(
                (existing?.dimensions ?? []).map((dimension) => dimension.name),
            );
            // Dimensions are merged by name: the target keeps its own and gains
            // the source's missing ones.
            const dimensionsToAdd = (datasource.dimensions ?? [])
                .filter(
                    (dimension) => !existingDimensionNames.has(dimension.name),
                )
                .map(({ name, entry_value }: CopySpaceDimension) => ({
                    name,
                    entry_value,
                }));
            const body = {
                datasource: {
                    name: datasource.name,
                    slug: datasource.slug,
                    dimensions_attributes: dimensionsToAdd,
                },
            };
            const response = await attempt(
                "datasources",
                datasource.name,
                () =>
                    existing
                        ? sbApi.put(`${base}/datasources/${existing.id}`, body)
                        : sbApi.post(`${base}/datasources/`, body),
            );
            const datasourceId = existing?.id ?? response?.data?.datasource?.id;

            if (!response || datasourceId === undefined) {
                const skipped =
                    source.entriesByDatasource.get(datasource.name) ?? [];

                if (skipped.length > 0) {
                    failures.push({
                        resource: "entries",
                        name: datasource.name,
                        message: `${skipped.length} entries not written because the datasource was not.`,
                    });
                }

                continue;
            }

            // Re-read so dimension ids are the target's own.
            const written = await sbApi.get(
                `${base}/datasources/${datasourceId}`,
            );
            const targetDimensionIdByName = new Map(
                (
                    (written?.data?.datasource?.dimensions ??
                        []) as CopySpaceDimension[]
                ).map((dimension) => [dimension.name, dimension.id]),
            );
            const targetEntryIdByName = new Map(
                (existing
                    ? (target.entriesByDatasource.get(datasource.name) ?? [])
                    : []
                ).map((entry) => [entry.name, entry.id]),
            );

            await mapWithConcurrency(
                source.entriesByDatasource.get(datasource.name) ?? [],
                concurrency,
                async (entry: CopySpaceEntry) => {
                    const label = `${datasource.name}/${entry.name}`;
                    const entryBody = {
                        name: entry.name,
                        value: entry.value,
                        datasource_id: datasourceId,
                    };
                    const existingEntryId = targetEntryIdByName.get(entry.name);
                    const entryResponse = await attempt("entries", label, () =>
                        existingEntryId !== undefined
                            ? sbApi.put(
                                  `${base}/datasource_entries/${existingEntryId}`,
                                  {
                                      datasource_entry: entryBody,
                                  },
                              )
                            : sbApi.post(`${base}/datasource_entries/`, {
                                  datasource_entry: entryBody,
                              }),
                    );
                    const entryId =
                        existingEntryId ??
                        entryResponse?.data?.datasource_entry?.id;

                    if (!entryResponse || entryId === undefined) {
                        return;
                    }

                    for (const [
                        dimensionName,
                        dimensionValue,
                    ] of Object.entries(entry.dimension_values ?? {})) {
                        const dimensionId =
                            targetDimensionIdByName.get(dimensionName);

                        if (dimensionId === undefined) {
                            failures.push({
                                resource: "entries",
                                name: `${label}@${dimensionName}`,
                                message: `dimension '${dimensionName}' does not exist on the target datasource.`,
                            });
                            continue;
                        }

                        await attempt(
                            "entries",
                            `${label}@${dimensionName}`,
                            () =>
                                sbApi.put(
                                    `${base}/datasource_entries/${entryId}`,
                                    {
                                        datasource_entry: {
                                            ...entryBody,
                                            dimension_value: dimensionValue,
                                        },
                                        dimension_id: dimensionId,
                                    },
                                ),
                        );
                    }
                },
            );
        }

        Logger.log("copy space: datasources and entries written.");
    }

    return failures;
};

export type CopySpaceRunResult = {
    plan: CopySpacePlan;
    applied: boolean;
    failures: CopySpaceFailure[];
};

/**
 * The whole command minus the terminal: read both spaces, plan, show the plan,
 * ask, write. The caller supplies how a plan is shown and how the question is
 * asked, so the CLI keeps the terminal and this keeps the rules.
 */
export const runCopySpace = async ({
    sbApi,
    sourceSpaceId,
    targetSpaceId,
    resources,
    dryRun,
    concurrency,
    showPlan,
    confirm,
}: {
    sbApi: CopySpaceSbApi;
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    dryRun: boolean;
    concurrency: number;
    showPlan: (plan: CopySpacePlan) => Promise<void> | void;
    confirm: () => Promise<boolean>;
}): Promise<CopySpaceRunResult> => {
    const source = await readCopySpaceSnapshot({
        sbApi,
        spaceId: sourceSpaceId,
        resources,
    });
    const target = await readCopySpaceSnapshot({
        sbApi,
        spaceId: targetSpaceId,
        resources,
        entriesFor: new Set(
            source.datasources.map((datasource) => datasource.name),
        ),
    });
    const plan = buildCopySpacePlan({
        sourceSpaceId,
        targetSpaceId,
        resources,
        source,
        target,
    });

    await showPlan(plan);

    if (dryRun || !(await confirm())) {
        return { plan, applied: false, failures: [] };
    }

    const failures = await applyCopySpace({
        sbApi,
        targetSpaceId,
        resources,
        source,
        target,
        concurrency,
    });

    return { plan, applied: true, failures };
};
