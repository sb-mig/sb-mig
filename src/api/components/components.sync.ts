import type { SyncResult } from "../sync/sync.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { uniqueValuesFrom } from "../../utils/array-utils.js";
import Logger from "../../utils/logger.js";
import { isObjectEmpty } from "../../utils/object-utils.js";

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
): Promise<void> {
    const existing = await getAllComponentsGroups(config);
    const existingNames = new Set((existing ?? []).map((g: any) => g.name));

    for (const groupName of groupNames) {
        if (!existingNames.has(groupName)) {
            await createComponentsGroup(groupName, config);
        }
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
    args: { components: any[]; presets: boolean; ssot?: boolean },
    config: RequestBaseConfig,
): Promise<SyncResult> {
    const { components, presets, ssot } = args;

    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    if (ssot) {
        const existingComponents = await getAllComponents(config);
        const existingGroups = await getAllComponentsGroups(config);
        await Promise.allSettled([
            ...(existingComponents ?? []).map((c: any) =>
                removeComponent(c, config),
            ),
            ...(existingGroups ?? []).map((g: any) =>
                removeComponentGroup(g, config),
            ),
        ]);
    }

    const nonEmptyComponents = components.filter((c) => !isObjectEmpty(c));
    const groupsToCheck = uniqueValuesFrom(
        nonEmptyComponents
            .filter((c) => c.component_group_name)
            .map((c) => c.component_group_name),
    );

    await ensureComponentGroupsExist(groupsToCheck, config);

    const remoteComponents = await getAllComponents(config);
    const remoteGroups = await getAllComponentsGroups(config);

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

    Logger.log("Components to update after check: ");
    const updateResults = await Promise.allSettled(
        updatePayloads.map((c) => updateComponent(c, presets, config) as any),
    );
    updateResults.forEach((r, idx) => {
        const name = String(updatePayloads[idx]?.name ?? "unknown");
        if (r.status === "fulfilled") result.updated.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    Logger.log("Components to create after check: ");
    const createResults = await Promise.allSettled(
        createPayloads.map((c) => createComponent(c, presets, config) as any),
    );
    createResults.forEach((r, idx) => {
        const name = String(createPayloads[idx]?.name ?? "unknown");
        if (r.status === "fulfilled") result.created.push(name);
        else result.errors.push({ name, message: String(r.reason) });
    });

    return result;
}
