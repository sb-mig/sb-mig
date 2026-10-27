import type { PresetFailure } from "../presets/resolvePresets.js";
import type {
    SyncOptions,
    SyncProgressCallback,
    SyncResult,
} from "../sync/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { uniqueValuesFrom } from "../../utils/array-utils.js";
import Logger from "../../utils/logger.js";
import { isObjectEmpty } from "../../utils/object-utils.js";
import { errorStatusOf } from "../../utils/retry.js";
import { formatDatasourceApiError as describeApiError } from "../datasources/error-formatting.js";
import { getAllPresets } from "../presets/presets.js";
import {
    type ComponentPlan,
    type DestructiveChange,
    detectDestructiveChanges,
    detectSsotGroupRemovals,
    detectSsotRemovals,
    planComponent,
} from "../sync/sync-plan.js";

/**
 * Default progress callback that logs to console
 */
const defaultProgress: SyncProgressCallback = (event) => {
    if (event.type === "start") {
        Logger.log(`Starting sync of ${event.total} components...`);
    } else if (event.type === "progress" && event.name) {
        const status =
            event.action === "creating"
                ? "Creating"
                : event.action === "updating"
                  ? "Updating"
                  : event.action === "created"
                    ? "✓ Created"
                    : event.action === "updated"
                      ? "✓ Updated"
                      : event.action === "skipped"
                        ? "⏭ Skipped"
                        : "✘ Error";
        Logger.log(
            `[${event.current}/${event.total}] ${status}: ${event.name}`,
        );
    } else if (event.type === "complete") {
        Logger.success(`Sync complete: ${event.message ?? "done"}`);
    }
};

import {
    createComponentForSync,
    createComponentsGroupForSync,
    getAllComponents,
    getAllComponentsGroups,
    removeComponentForSync,
    updateComponentForSync,
} from "./components.js";

type RemovalTarget = {
    type: "component" | "component group";
    item: any;
    name: string;
    remove: () => Promise<any>;
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && !(error as any).response) {
        return error.message;
    }
    // Storyblok client errors are plain objects: `String()` would say
    // `[object Object]` where the status and the API's message belong.
    return describeApiError(error);
}

/**
 * Create the groups the components need, and return every group the space
 * has afterwards. A group that cannot be created is an error of its own;
 * the components in it still sync, without the group.
 */
async function ensureComponentGroupsExist(
    groupNames: string[],
    existingGroups: any[],
    config: RequestBaseConfig,
    result: SyncResult,
    options: SyncOptions = {},
): Promise<any[]> {
    const groups = [...existingGroups];
    const existingNames = new Set(groups.map((g: any) => g.name));

    for (const groupName of groupNames) {
        if (existingNames.has(groupName)) continue;

        if (options.dryRun) {
            Logger.warning(
                `[dry-run] Would create component group '${groupName}'.`,
            );
            continue;
        }

        try {
            groups.push(await createComponentsGroupForSync(groupName, config));
        } catch (error) {
            result.errors.push({
                scope: "component-group",
                name: groupName,
                message: getErrorMessage(error),
            });
        }
    }

    return groups;
}

/**
 * --ssot deletes every component and group before it creates anything. Run
 * from the wrong directory, or with the wrong schemaFileExt, it finds no
 * schema files and would leave the space empty. Refuse, before any removal,
 * when nothing local was found, or when no component in the space is among
 * the local ones.
 */
function refuseUnsafeSsot(
    components: any[],
    existingComponents: any[],
    existingGroups: any[],
): void {
    const localNames = new Set(
        components
            .filter((c) => !isObjectEmpty(c) && c?.name)
            .map((c) => String(c.name)),
    );
    const inSpace = `${existingComponents.length} component(s) and ${existingGroups.length} group(s)`;

    if (localNames.size === 0) {
        throw new Error(
            `Refusing --ssot: no component schema files were found, so it would delete all ${inSpace} in the space and create nothing. Check the working directory and schemaFileExt.`,
        );
    }

    if (
        existingComponents.length > 0 &&
        !existingComponents.some((c: any) => localNames.has(String(c?.name)))
    ) {
        throw new Error(
            `Refusing --ssot: none of the ${existingComponents.length} component(s) in the space is in your schema files, so it would delete all ${inSpace}. Check the working directory and schemaFileExt.`,
        );
    }
}

/**
 * Re-read the space after failed --ssot removals. An item that is gone was
 * removed after all: it joins `removed`, and its removal error is dropped.
 */
async function confirmFailedRemovals(
    failed: RemovalTarget[],
    removed: Set<any>,
    result: SyncResult,
    config: RequestBaseConfig,
): Promise<void> {
    const stillThere = async (
        type: RemovalTarget["type"],
    ): Promise<Set<string> | undefined> => {
        try {
            const items =
                type === "component"
                    ? await getAllComponents(config)
                    : await getAllComponentsGroups(config);
            return new Set((items ?? []).map((item: any) => String(item.id)));
        } catch (error) {
            Logger.warning(
                `Could not re-read the space after a failed removal: ${getErrorMessage(error)}`,
            );
            return undefined;
        }
    };

    const ids = {
        component: failed.some((t) => t.type === "component")
            ? await stillThere("component")
            : undefined,
        "component group": failed.some((t) => t.type === "component group")
            ? await stillThere("component group")
            : undefined,
    };

    for (const target of failed) {
        const present = ids[target.type];
        if (!present || present.has(String(target.item?.id))) continue;

        const name = `${target.type} '${target.name}'`;
        Logger.log(`${name} was removed after all.`);
        removed.add(target.item);
        result.skipped = result.skipped.filter((skipped) => skipped !== name);
        result.errors = result.errors.filter(
            (error) => !(error.scope === "ssot-removal" && error.name === name),
        );
    }
}

function recordPresetFailures(
    componentName: string,
    failures: PresetFailure[],
    result: SyncResult,
): void {
    for (const failure of failures) {
        result.errors.push({
            scope: "preset",
            name: `${componentName}/${failure.name}`,
            parent: componentName,
            message: getErrorMessage(failure.error),
        });
    }
}

// Ids and timestamps belong to the space a file was exported from; a create
// payload must never carry them into the target space.
const REMOTE_ONLY_FIELDS = ["id", "space_id", "created_at", "updated_at"];

const stripRemoteIdentity = (source: any): any => {
    const payload = { ...source };
    for (const field of REMOTE_ONLY_FIELDS) {
        delete payload[field];
    }
    return payload;
};

function resolveGroupUuid(component: any, remoteGroups: any[]): any {
    if (!component.component_group_name) {
        return { ...component, component_group_uuid: null };
    }

    const match = remoteGroups.find(
        (g: any) => g.name === component.component_group_name,
    );
    if (!match) return { ...component, component_group_uuid: null };
    return { ...component, component_group_uuid: match.uuid };
}

export async function syncComponentsData(
    args: {
        components: any[];
        presets: boolean;
        ssot?: boolean;
        dryRun?: boolean;
        /**
         * Stop when the space cannot be listed, instead of syncing against an
         * empty listing (MAR-3139). The CLI sets it; api-v2 callers keep the
         * old behaviour, a warning and a recorded error.
         */
        strict?: boolean;
        onProgress?: SyncProgressCallback;
    },
    config: RequestBaseConfig,
): Promise<SyncResult> {
    const { components, presets, ssot, dryRun, strict, onProgress } = args;
    const progress = onProgress ?? defaultProgress;

    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    if (dryRun) {
        Logger.warning(
            "[dry-run] Component sync will only read remote data and report planned changes.",
        );
    }

    const destructive: DestructiveChange[] = [];

    /** Undefined when the listing failed and the sync is not strict. */
    const listOrRecord = async (
        what: string,
        list: () => Promise<any>,
    ): Promise<any[] | undefined> => {
        try {
            return (await list()) ?? [];
        } catch (error) {
            if (strict) throw error;

            const message = getErrorMessage(error);
            Logger.warning(`Could not fetch ${what}: ${message}`);
            result.errors.push({ scope: "listing", name: what, message });
            return undefined;
        }
    };

    // Under --ssot the space is listed once, before anything is removed.
    // The plan compares against that listing: SSOT deletes and recreates
    // every component, so the fields it drops are exactly what a reader
    // must see. What remains afterwards is derived from the removals, never
    // listed again: a failed listing after the removals would otherwise
    // stop the run with every component deleted.
    let ssotState:
        | {
              planComponents: any[];
              planGroups: any[];
              remainingComponents: any[];
              remainingGroups: any[];
          }
        | undefined;

    if (ssot) {
        const existingComponents = (await getAllComponents(config)) ?? [];
        const existingGroups = (await getAllComponentsGroups(config)) ?? [];

        if (strict) {
            refuseUnsafeSsot(components, existingComponents, existingGroups);
        }
        const removed = new Set<any>();

        destructive.push(
            ...detectSsotGroupRemovals(
                components
                    .filter((c) => !isObjectEmpty(c) && c?.component_group_name)
                    .map((c) => String(c.component_group_name)),
                existingGroups,
            ),
            ...detectSsotRemovals(
                components
                    .filter((c) => !isObjectEmpty(c) && c?.name)
                    .map((c) => String(c.name)),
                existingComponents ?? [],
            ),
        );

        if (dryRun) {
            existingComponents.forEach((c: any) => removed.add(c));
            existingGroups.forEach((g: any) => removed.add(g));

            for (const component of existingComponents ?? []) {
                Logger.warning(
                    `[dry-run] Would remove component '${component.name}'.`,
                );
            }
            for (const group of existingGroups ?? []) {
                Logger.warning(
                    `[dry-run] Would remove component group '${group.name}'.`,
                );
            }
        } else {
            const removalTargets: RemovalTarget[] = [
                ...(existingComponents ?? []).map((component: any) => ({
                    type: "component" as const,
                    item: component,
                    name: String(component?.name ?? component?.id ?? "unknown"),
                    remove: () =>
                        removeComponentForSync(component, "components", config),
                })),
                ...(existingGroups ?? []).map((group: any) => ({
                    type: "component group" as const,
                    item: group,
                    name: String(group?.name ?? group?.id ?? "unknown"),
                    remove: () =>
                        removeComponentForSync(
                            group,
                            "component_groups",
                            config,
                        ),
                })),
            ];

            const removalResults = await Promise.allSettled(
                removalTargets.map((target) => target.remove()),
            );

            const failedRemovals: RemovalTarget[] = [];

            removalResults.forEach((removalResult, index) => {
                const target = removalTargets[index];
                if (!target) return;

                if (removalResult.status === "fulfilled") {
                    removed.add(target.item);
                    return;
                }

                failedRemovals.push(target);
                const name = `${target.type} '${target.name}'`;
                const message = getErrorMessage(removalResult.reason);

                result.skipped.push(name);
                result.errors.push({
                    scope: "ssot-removal",
                    name,
                    message: `SSOT removal failed: ${message}`,
                });
                Logger.warning(
                    `Could not remove ${name} during SSOT sync: ${message}`,
                );
            });

            // A removal that failed may still have happened: the DELETE
            // committed and its answer was lost (a 504, a timeout). Ask the
            // space which of those items are really still there. If it
            // cannot answer, keep them, and the update path below falls back
            // to a create on a 404.
            if (failedRemovals.length > 0) {
                await confirmFailedRemovals(
                    failedRemovals,
                    removed,
                    result,
                    config,
                );
            }
        }

        ssotState = {
            planComponents: existingComponents,
            planGroups: existingGroups,
            remainingComponents: existingComponents.filter(
                (c: any) => !removed.has(c),
            ),
            remainingGroups: existingGroups.filter((g: any) => !removed.has(g)),
        };
    }

    const nonEmptyComponents = components.filter((c) => !isObjectEmpty(c));
    const groupsToCheck = uniqueValuesFrom(
        nonEmptyComponents
            .filter((c) => c.component_group_name)
            .map((c) => c.component_group_name),
    );

    // Every listing happens before the first write, so a strict run that
    // cannot read the space stops with nothing written.
    const listedGroups = ssotState
        ? ssotState.remainingGroups
        : await listOrRecord("component groups", () =>
              getAllComponentsGroups(config),
          );
    const remoteComponents: any[] = ssotState
        ? ssotState.remainingComponents
        : ((await listOrRecord("components", () => getAllComponents(config))) ??
          []);

    // Without a group listing nothing is created: every group would look
    // missing. The uuids are then read once more, as before MAR-4104.
    const remoteGroups: any[] = listedGroups
        ? await ensureComponentGroupsExist(
              groupsToCheck,
              listedGroups,
              config,
              result,
              { dryRun },
          )
        : ((await listOrRecord("component groups", () =>
              getAllComponentsGroups(config),
          )) ?? []);

    // The space's presets with their content, so the plan can tell an
    // unchanged preset from one the sync overwrites. Not under --ssot: there
    // every preset goes with its component and is created again.
    const remotePresets: any[] | undefined =
        presets && !ssotState
            ? await listOrRecord("presets", () => getAllPresets(config))
            : undefined;
    const presetsOf = (remote: any): any[] | undefined => {
        if (!remotePresets || !remote) return undefined;
        const ids = new Set(
            (Array.isArray(remote.all_presets) ? remote.all_presets : []).map(
                (preset: any) => preset?.id,
            ),
        );
        return remotePresets.filter(
            (preset: any) =>
                preset?.component_id === remote.id || ids.has(preset?.id),
        );
    };

    const planComponents = ssotState?.planComponents ?? remoteComponents;
    const planGroups = ssotState?.planGroups ?? remoteGroups;
    // Existed before --ssot and was (or, in a dry-run, would be) removed.
    const recreatedNames = new Set<string>(
        ssotState
            ? ssotState.planComponents
                  .filter(
                      (c: any) => !ssotState?.remainingComponents.includes(c),
                  )
                  .map((c: any) => String(c.name))
            : [],
    );
    const markRecreated = (name: string) => {
        recreatedNames.add(name);
        const index = plans.findIndex((plan) => plan.name === name);
        const plan = plans[index];
        if (plan) plans[index] = { ...plan, recreated: true };
    };

    const componentsToUpdate: any[] = [];
    const componentsToCreate: any[] = [];
    const plans: ComponentPlan[] = [];

    for (const component of nonEmptyComponents) {
        if (!component?.name) {
            result.skipped.push("unknown");
            continue;
        }

        const remote = remoteComponents.find(
            (rc: any) => rc.name === component.name,
        );
        const planRemote = planComponents.find(
            (rc: any) => rc.name === component.name,
        );
        const plan = planComponent({
            local: component,
            remote: planRemote,
            remoteGroups: planGroups,
            presets,
            remotePresets: presetsOf(planRemote),
        });
        plans.push(
            recreatedNames.has(String(component.name))
                ? { ...plan, recreated: true }
                : plan,
        );
        destructive.push(...detectDestructiveChanges(plan));

        if (remote) {
            // Spread first: a local file exported from another space can carry a
            // stale id, and it must never win over the id we are updating.
            componentsToUpdate.push({ ...component, id: remote.id });
        } else {
            componentsToCreate.push(stripRemoteIdentity(component));
        }
    }

    // Resolve group uuids after ensureComponentGroupsExist
    const updatePayloads = componentsToUpdate.map((c) =>
        resolveGroupUuid(c, remoteGroups),
    );
    const createPayloads = componentsToCreate.map((c) =>
        resolveGroupUuid(c, remoteGroups),
    );

    const totalComponents = updatePayloads.length + createPayloads.length;
    let currentIndex = 0;

    // Report start
    progress({ type: "start", total: totalComponents });

    // Process updates sequentially for progress reporting
    for (const component of updatePayloads) {
        const name = String(component?.name ?? "unknown");
        currentIndex++;

        progress({
            type: "progress",
            current: currentIndex,
            total: totalComponents,
            name,
            action: "updating",
        });

        try {
            if (dryRun) {
                const unchanged =
                    plans.find((plan) => plan.name === name)?.action ===
                    "unchanged";
                Logger.warning(
                    unchanged
                        ? `[dry-run] Component '${name}' is unchanged.`
                        : `[dry-run] Would update component '${name}'.`,
                );
                result.updated.push(name);
                progress({
                    type: "progress",
                    current: currentIndex,
                    total: totalComponents,
                    name,
                    action: "updated",
                });
                continue;
            }

            let presetFailures: PresetFailure[];

            try {
                presetFailures = await updateComponentForSync(
                    component,
                    presets,
                    config,
                );
                result.updated.push(name);
            } catch (error) {
                // Under --ssot a component whose removal looked failed may be
                // gone after all. Updating a deleted id answers 404: create it
                // instead, or the sync ends with the component lost.
                if (!(ssot && errorStatusOf(error) === 404)) throw error;

                Logger.warning(
                    `Component '${name}' is gone after the --ssot removals; creating it again.`,
                );
                presetFailures = await createComponentForSync(
                    stripRemoteIdentity(component),
                    presets,
                    config,
                );
                result.created.push(name);
                markRecreated(name);

                // The 404 says the removal went through after all.
                const removal = `component '${name}'`;
                result.skipped = result.skipped.filter((s) => s !== removal);
                result.errors = result.errors.filter(
                    (e) => !(e.scope === "ssot-removal" && e.name === removal),
                );
            }

            recordPresetFailures(name, presetFailures, result);
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "updated",
            });
        } catch (error) {
            result.errors.push({
                scope: "component",
                name,
                message: getErrorMessage(error),
            });
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "error",
                message: getErrorMessage(error),
            });
        }
    }

    // Process creates sequentially for progress reporting
    for (const component of createPayloads) {
        const name = String(component?.name ?? "unknown");
        currentIndex++;

        progress({
            type: "progress",
            current: currentIndex,
            total: totalComponents,
            name,
            action: "creating",
        });

        try {
            if (dryRun) {
                Logger.warning(`[dry-run] Would create component '${name}'.`);
                result.created.push(name);
                progress({
                    type: "progress",
                    current: currentIndex,
                    total: totalComponents,
                    name,
                    action: "created",
                });
                continue;
            }

            const presetFailures = await createComponentForSync(
                component,
                presets,
                config,
            );
            result.created.push(name);
            recordPresetFailures(name, presetFailures, result);
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "created",
            });
        } catch (error) {
            result.errors.push({
                scope: "component",
                name,
                message: getErrorMessage(error),
            });
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "error",
                message: getErrorMessage(error),
            });
        }
    }

    result.plan = { components: plans, destructive };

    // Report completion
    progress({
        type: "complete",
        total: totalComponents,
        message: `${result.created.length} created, ${result.updated.length} updated, ${result.errors.length} errors`,
    });

    return result;
}
