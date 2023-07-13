import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../utils/logger.js";

import { getComponentPresets } from "./componentPresets.js";
import { updatePreset, createPreset } from "./presets.js";

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
                    preset: {
                        id: shouldBeUpdated.preset.id,
                        ...componentPreset.preset,
                    },
                });
            } else {
                presetsToCreate.push(componentPreset);
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
