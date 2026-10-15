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
    createComponent,
    createComponentsGroup,
    getAllComponents,
    getAllComponentsGroups,
    removeComponent,
    removeComponentGroup,
    updateComponent,
} from "./components.js";

type RemovalTarget = {
    type: "component" | "component group";
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
 * Create the groups the components need. A group that cannot be created is
 * an error of its own; the components in it still sync, without the group.
 */
async function ensureComponentGroupsExist(
    groupNames: string[],
    config: RequestBaseConfig,
    result: SyncResult,
    options: SyncOptions = {},
): Promise<void> {
    // A failed listing is never "no groups" (MAR-3139): it would re-create
    // every group, or drop every component out of its group.
    const existing = await getAllComponentsGroups(config);
    const existingNames = new Set((existing ?? []).map((g: any) => g.name));

    for (const groupName of groupNames) {
        if (existingNames.has(groupName)) continue;

        if (options.dryRun) {
            Logger.warning(
                `[dry-run] Would create component group '${groupName}'.`,
            );
            continue;
        }

        try {
            await createComponentsGroup(groupName, config);
        } catch (error) {
            result.errors.push({
                scope: "component-group",
                name: groupName,
                message: getErrorMessage(error),
            });
        }
    }
}

function recordPresetFailures(
    componentName: string,
    presetResults: unknown,
    result: SyncResult,
): void {
    if (!Array.isArray(presetResults)) return;

    for (const preset of presetResults) {
        if (preset && typeof preset === "object" && preset.ok === false) {
            result.errors.push({
                scope: "preset",
                name: `${componentName}/${String(preset.name ?? "unknown")}`,
                message: getErrorMessage(preset.error),
            });
        }
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
        onProgress?: SyncProgressCallback;
    },
    config: RequestBaseConfig,
): Promise<SyncResult> {
    const { components, presets, ssot, dryRun, onProgress } = args;
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

    if (ssot) {
        const existingComponents = await getAllComponents(config);
        const existingGroups = await getAllComponentsGroups(config);

        destructive.push(
            ...detectSsotRemovals(
                components
                    .filter((c) => !isObjectEmpty(c) && c?.name)
                    .map((c) => String(c.name)),
                existingComponents ?? [],
            ),
        );

        if (dryRun) {
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
                    name: String(component?.name ?? component?.id ?? "unknown"),
                    remove: () => removeComponent(component, config),
                })),
                ...(existingGroups ?? []).map((group: any) => ({
                    type: "component group" as const,
                    name: String(group?.name ?? group?.id ?? "unknown"),
                    remove: () => removeComponentGroup(group, config),
                })),
            ];

            const removalResults = await Promise.allSettled(
                removalTargets.map((target) => target.remove()),
            );

            removalResults.forEach((removalResult, index) => {
                if (removalResult.status === "fulfilled") return;

                const target = removalTargets[index];
                if (!target) return;

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
    }

    const nonEmptyComponents = components.filter((c) => !isObjectEmpty(c));
    const groupsToCheck = uniqueValuesFrom(
        nonEmptyComponents
            .filter((c) => c.component_group_name)
            .map((c) => c.component_group_name),
    );

    await ensureComponentGroupsExist(groupsToCheck, config, result, {
        dryRun,
    });

    // A failed listing stops the sync: read as "no components", it would turn
    // every update into a create (MAR-3139).
    const remoteComponents: any[] =
        ssot && dryRun ? [] : ((await getAllComponents(config)) ?? []);
    const remoteGroups: any[] = (await getAllComponentsGroups(config)) ?? [];

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
            remote,
            remoteGroups,
            presets,
        });
        plans.push(plan);
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

            const presetResults = await updateComponent(
                component,
                presets,
                config,
            );
            result.updated.push(name);
            recordPresetFailures(name, presetResults, result);
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

            const presetResults = await createComponent(
                component,
                presets,
                config,
            );
            result.created.push(name);
            recordPresetFailures(name, presetResults, result);
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
