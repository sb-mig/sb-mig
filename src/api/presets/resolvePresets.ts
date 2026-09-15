import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../utils/logger.js";

import { getComponentPresets } from "./componentPresets.js";
import { updatePreset, createPreset } from "./presets.js";

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

const _resolvePresets = async (
    res: any,
    all_presets: any,
    component: any,
    config: RequestBaseConfig,
) => {
    const componentId = res.data.component.id;

    if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map((p: any) => {
            return { preset: { ...p.preset, component_id: componentId } };
        });
        Logger.log(`Checking preset for '${component.name}' component`);

        const allRemoteComponentPresets = await getComponentPresets(
            component.name,
            config,
        );

        const presetsToUpdate = [];
        const presetsToCreate = [];

        for (const componentPreset of all_presets_modified) {
            const shouldBeUpdated: any =
                allRemoteComponentPresets &&
                allRemoteComponentPresets.find(
                    (remotePreset: any) =>
                        componentPreset.preset.name ===
                        remotePreset.preset.name,
                );
            if (shouldBeUpdated) {
                presetsToUpdate.push({
                    ...componentPreset,
                    // Spread first: a stale local preset id must never win over
                    // the id of the remote preset we are updating.
                    preset: {
                        ...componentPreset.preset,
                        id: shouldBeUpdated.preset.id,
                    },
                });
            } else {
                presetsToCreate.push({
                    ...componentPreset,
                    preset: stripRemoteIdentity(componentPreset.preset),
                });
            }
        }

        const presetsToUpdateResult = await Promise.all(
            presetsToUpdate.map((preset) => {
                return updatePreset({ p: preset }, config);
            }),
        );

        const presetsToCreateResult = await Promise.all(
            presetsToCreate.map((preset) => {
                return createPreset(preset, config);
            }),
        );

        return [...presetsToCreateResult, presetsToUpdateResult];
    } else {
        Logger.warning("There are no presets for this component.");
        return [];
    }
};

export default _resolvePresets;
