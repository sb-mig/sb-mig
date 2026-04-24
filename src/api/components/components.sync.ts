import type {
    SyncOptions,
    SyncProgressCallback,
    SyncResult,
} from "../sync/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { uniqueValuesFrom } from "../../utils/array-utils.js";
import Logger from "../../utils/logger.js";
import { isObjectEmpty } from "../../utils/object-utils.js";

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

async function ensureComponentGroupsExist(
    groupNames: string[],
    config: RequestBaseConfig,
    options: SyncOptions = {},
): Promise<void> {
    try {
        const existing = await getAllComponentsGroups(config);
        const existingNames = new Set((existing ?? []).map((g: any) => g.name));

        for (const groupName of groupNames) {
            if (!existingNames.has(groupName)) {
                if (options.dryRun) {
                    Logger.warning(
                        `[dry-run] Would create component group '${groupName}'.`,
                    );
                    continue;
                }

                await createComponentsGroup(groupName, config);
            }
        }
    } catch (error) {
        // Log but don't fail - component groups are optional
        Logger.warning(
            `Could not fetch component groups: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

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

    if (ssot) {
        const existingComponents = await getAllComponents(config);
        const existingGroups = await getAllComponentsGroups(config);

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
            await Promise.allSettled([
                ...(existingComponents ?? []).map((c: any) =>
                    removeComponent(c, config),
                ),
                ...(existingGroups ?? []).map((g: any) =>
                    removeComponentGroup(g, config),
                ),
            ]);
        }
    }

    const nonEmptyComponents = components.filter((c) => !isObjectEmpty(c));
    const groupsToCheck = uniqueValuesFrom(
        nonEmptyComponents
            .filter((c) => c.component_group_name)
            .map((c) => c.component_group_name),
    );

    await ensureComponentGroupsExist(groupsToCheck, config, { dryRun });

    let remoteComponents: any[] = [];
    let remoteGroups: any[] = [];

    try {
        remoteComponents =
            ssot && dryRun ? [] : ((await getAllComponents(config)) ?? []);
    } catch (error) {
        Logger.warning(
            `Could not fetch remote components: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    try {
        remoteGroups = (await getAllComponentsGroups(config)) ?? [];
    } catch (error) {
        Logger.warning(
            `Could not fetch remote groups: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const componentsToUpdate: any[] = [];
    const componentsToCreate: any[] = [];

    for (const component of nonEmptyComponents) {
        if (!component?.name) {
            result.skipped.push("unknown");
            continue;
        }

        const remote = remoteComponents.find(
            (rc: any) => rc.name === component.name,
        );
        if (remote) {
            componentsToUpdate.push({ id: remote.id, ...component });
        } else {
            componentsToCreate.push(component);
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
                Logger.warning(`[dry-run] Would update component '${name}'.`);
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

            await updateComponent(component, presets, config);
            result.updated.push(name);
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "updated",
            });
        } catch (error) {
            result.errors.push({
                name,
                message: error instanceof Error ? error.message : String(error),
            });
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "error",
                message: error instanceof Error ? error.message : String(error),
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

            await createComponent(component, presets, config);
            result.created.push(name);
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "created",
            });
        } catch (error) {
            result.errors.push({
                name,
                message: error instanceof Error ? error.message : String(error),
            });
            progress({
                type: "progress",
                current: currentIndex,
                total: totalComponents,
                name,
                action: "error",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Report completion
    progress({
        type: "complete",
        total: totalComponents,
        message: `${result.created.length} created, ${result.updated.length} updated, ${result.errors.length} errors`,
    });

    return result;
}
