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
    planDefaultPresetRestores,
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

/** `undefined`, `null` and `""` all mean "no translation" on both sides. */
const normaliseDimensionValue = (value: unknown): string =>
    value === undefined || value === null ? "" : String(value);

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
            if (!valueByName.has(entry.name)) {
                continue;
            }

            // A cleared translation is a value too: dropping it here is how a
            // clear in the source used to leave a stale target translation in
            // place while reporting success.
            entry.dimension_values = {
                ...(entry.dimension_values ?? {}),
                [dimension.name]: normaliseDimensionValue(
                    valueByName.get(entry.name),
                ),
            };
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
    // A read after the first write must not throw the run away: the writes
    // already sent, and every failure collected so far, have to reach the
    // report. On failure the run carries on from what it already knows.
    const refresh = async <T>(
        resource: CopySpaceFailure["resource"],
        read: () => Promise<T>,
    ): Promise<T | undefined> => {
        try {
            return await read();
        } catch (error) {
            const failure = {
                resource,
                name: "refresh",
                message: describeError(error),
            };

            failures.push(failure);
            Logger.error(
                `copy space: re-reading ${resource} after writing them failed; carrying on with what this run already knows. ${failure.message}`,
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
        targetGroups = (await refresh("groups", () =>
            readAll(sbApi, `${base}/component_groups/`, "component_groups"),
        )) ??
            // The target's own groups plus every group this run created.
            [...targetByPath.values()];
    }

    let targetComponents = target.components;
    let componentIdsUnknown = new Set<string>();
    const presetIdByKey = new Map<string, number | undefined>();
    // Outcomes, not ids. A component or preset the target already had has an id
    // before this run touches it, so an id proves nothing about whether this
    // run's write to it landed. These hold only writes that did.
    const componentsWritten = new Set<string>();
    const presetsWritten = new Set<string>();

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
        const createdComponents: CopySpaceComponent[] = [];
        const createdWithoutId = new Set<string>();

        await mapWithConcurrency(
            source.components,
            concurrency,
            async (component: CopySpaceComponent) => {
                const { payload } = remapComponentForTarget({
                    component,
                    groupMap,
                });
                const existingId = targetIdByName.get(component.name);
                const response = await attempt(
                    "components",
                    component.name,
                    () =>
                        existingId !== undefined
                            ? sbApi.put(`${base}/components/${existingId}`, {
                                  component: payload,
                              })
                            : sbApi.post(`${base}/components/`, {
                                  component: payload,
                              }),
                );

                if (response) {
                    componentsWritten.add(component.name);
                }

                if (existingId === undefined && response) {
                    const createdId = response?.data?.component?.id;

                    if (createdId === undefined) {
                        createdWithoutId.add(component.name);
                    } else {
                        createdComponents.push({
                            ...payload,
                            id: createdId,
                            name: component.name,
                        });
                    }
                }
            },
        );

        Logger.log("copy space: components written.");

        const refreshed = await refresh("components", () =>
            readAll(sbApi, `${base}/components/`, "components"),
        );

        targetComponents = refreshed ?? [
            ...target.components,
            ...createdComponents,
        ];
        // A refreshed list knows every id; without it, a component created
        // without an id in its response cannot be pointed at.
        componentIdsUnknown = refreshed ? new Set() : createdWithoutId;
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

        for (const [key, id] of targetPresetIdByKey) {
            presetIdByKey.set(key, id);
        }

        await mapWithConcurrency(
            source.presets,
            concurrency,
            async (preset: CopySpacePreset) => {
                const remap = remapPresetForTarget({
                    preset,
                    sourceComponentNameById,
                    targetComponentIdByName,
                });

                if (
                    remap.componentName &&
                    componentIdsUnknown.has(remap.componentName)
                ) {
                    failures.push({
                        resource: "presets",
                        name: `${remap.componentName}/${preset.name}`,
                        message: `skipped: component '${remap.componentName}' was created but its id could not be read back, so this preset cannot point at it.`,
                    });
                    return;
                }

                if (!remap.payload || !remap.componentName) {
                    // Planned as a skip; nothing to write.
                    return;
                }

                const label = `${remap.componentName}/${preset.name}`;
                const key = presetMatchKey(remap.componentName, preset.name);
                const existingId = targetPresetIdByKey.get(key);
                const response = await attempt("presets", label, () =>
                    existingId !== undefined
                        ? sbApi.put(`${base}/presets/${existingId}`, {
                              preset: remap.payload,
                          })
                        : sbApi.post(`${base}/presets/`, {
                              preset: remap.payload,
                          }),
                );

                if (response) {
                    presetsWritten.add(key);
                }

                if (existingId === undefined && response?.data?.preset?.id) {
                    presetIdByKey.set(key, response.data.preset.id);
                }
            },
        );

        Logger.log("copy space: presets written.");
    }

    if (inScope("components") && inScope("presets")) {
        const componentIdByName = new Map(
            targetComponents.map((component) => [component.name, component.id]),
        );

        await mapWithConcurrency(
            planDefaultPresetRestores({ source, resources }).restore,
            concurrency,
            async ({ componentName, presetComponentName, presetName }) => {
                const name = `${componentName}@preset_id`;
                const presetKey = presetMatchKey(
                    presetComponentName,
                    presetName,
                );
                const componentId = componentIdByName.get(componentName);
                const presetId = presetIdByKey.get(presetKey);
                const componentWritten = componentsWritten.has(componentName);
                const presetWritten = presetsWritten.has(presetKey);

                // A default preset is only pointed at a preset this run wrote,
                // on a component this run wrote. A rejected preset update would
                // otherwise switch the component to a stale preset, and a
                // rejected component update would still have its preset_id
                // rewritten. Either way the target's own preset_id is left alone.
                if (!componentWritten || !presetWritten) {
                    const message = !componentWritten
                        ? `the component was not written, so its default preset '${presetComponentName}/${presetName}' was left as it is in the target.`
                        : `its default preset '${presetComponentName}/${presetName}' was not written, so the component's default preset was left as it is in the target.`;

                    failures.push({ resource: "components", name, message });
                    Logger.error(`copy space: components '${name}' ${message}`);
                    return;
                }

                if (componentId === undefined || presetId === undefined) {
                    failures.push({
                        resource: "components",
                        name,
                        message:
                            componentId === undefined
                                ? `the component's id in the target is unknown, so its default preset '${presetName}' was not restored.`
                                : `its default preset '${presetComponentName}/${presetName}' was not written, so it was not restored.`,
                    });
                    return;
                }

                await attempt("components", name, () =>
                    sbApi.put(`${base}/components/${componentId}`, {
                        component: { preset_id: presetId },
                    }),
                );
            },
        );

        Logger.log("copy space: default presets restored.");
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
            const targetDimensionByName = new Map(
                (existing?.dimensions ?? []).map((dimension) => [
                    dimension.name,
                    dimension,
                ]),
            );
            // Dimensions are merged by name. A source dimension the target also
            // has is sent with the target's id, so a changed entry_value updates
            // it in place; one the target lacks is created. Target-only
            // dimensions are not mentioned, and nothing is ever marked for
            // deletion.
            const dimensionsAttributes = (datasource.dimensions ?? []).map(
                ({ name, entry_value }: CopySpaceDimension) => {
                    const matchedId = targetDimensionByName.get(name)?.id;

                    return matchedId !== undefined
                        ? { id: matchedId, name, entry_value }
                        : { name, entry_value };
                },
            );
            const body = {
                datasource: {
                    name: datasource.name,
                    slug: datasource.slug,
                    dimensions_attributes: dimensionsAttributes,
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

            // Re-read so dimension ids are the target's own; fall back to what
            // the write itself returned.
            const refreshedDatasource = await refresh("datasources", () =>
                sbApi.get(`${base}/datasources/${datasourceId}`),
            );
            const writtenDatasource =
                refreshedDatasource?.data?.datasource ??
                response?.data?.datasource;
            const dimensionIdsKnown = Array.isArray(
                writtenDatasource?.dimensions,
            );
            const targetDimensionIdByName = new Map(
                (
                    (writtenDatasource?.dimensions ??
                        []) as CopySpaceDimension[]
                ).map((dimension) => [dimension.name, dimension.id]),
            );
            const targetEntryByName = new Map(
                (existing
                    ? (target.entriesByDatasource.get(datasource.name) ?? [])
                    : []
                ).map((entry) => [entry.name, entry]),
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
                    const targetEntry = targetEntryByName.get(entry.name);
                    const existingEntryId = targetEntry?.id;
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
                        const wanted = normaliseDimensionValue(dimensionValue);

                        // Only a value that differs costs a write: a clear
                        // propagates, an unchanged translation does not cost a
                        // PUT per entry per dimension on every rerun.
                        if (
                            wanted ===
                            normaliseDimensionValue(
                                targetEntry?.dimension_values?.[dimensionName],
                            )
                        ) {
                            continue;
                        }

                        const dimensionId =
                            targetDimensionIdByName.get(dimensionName);

                        if (dimensionId === undefined) {
                            failures.push({
                                resource: "entries",
                                name: `${label}@${dimensionName}`,
                                message: dimensionIdsKnown
                                    ? `dimension '${dimensionName}' does not exist on the target datasource.`
                                    : `dimension '${dimensionName}' has no known id: the datasource could not be read back after writing.`,
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
                                            dimension_value: wanted,
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
