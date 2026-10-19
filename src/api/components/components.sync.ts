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
import { formatDatasourceApiError as describeApiError } from "../datasources/error-formatting.js";
import {
    type ComponentPlan,
    type DestructiveChange,
    detectDestructiveChanges,
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
    removeComponent,
    removeComponentGroup,
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
        const removed = new Set<any>();

        destructive.push(
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
                    remove: () => removeComponent(component, config),
                })),
                ...(existingGroups ?? []).map((group: any) => ({
                    type: "component group" as const,
                    item: group,
                    name: String(group?.name ?? group?.id ?? "unknown"),
                    remove: () => removeComponentGroup(group, config),
                })),
            ];

            const removalResults = await Promise.allSettled(
                removalTargets.map((target) => target.remove()),
            );

            removalResults.forEach((removalResult, index) => {
                const target = removalTargets[index];
                if (!target) return;

                if (removalResult.status === "fulfilled") {
                    removed.add(target.item);
                    return;
                }

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
        const plan = planComponent({
            local: component,
            remote: planComponents.find(
                (rc: any) => rc.name === component.name,
            ),
            remoteGroups: planGroups,
            presets,
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

            const presetFailures = await updateComponentForSync(
                component,
                presets,
                config,
            );
            result.updated.push(name);
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
