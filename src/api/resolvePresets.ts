import Logger from "../utils/logger.js";
import { updatePreset, createPreset } from "./presets.js";
import { getComponentPresets } from "./componentPresets.js";

const _resolvePresets = async (res: any, all_presets: any, component: any) => {
    const componentId = res.data.component.id;

    if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map((p: any) => {
            return { preset: { ...p.preset, component_id: componentId } };
        });
        Logger.log(`Checking preset for '${component.name}' component`);

        const allRemoteComponentPresets = await getComponentPresets(
            component.name
        );

        const presetsToUpdate = [];
        const presetsToCreate = [];

        for (const componentPreset of all_presets_modified) {
            const shouldBeUpdated: any =
                allRemoteComponentPresets &&
                allRemoteComponentPresets.find(
                    (remotePreset: any) =>
                        componentPreset.preset.name === remotePreset.preset.name
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

        presetsToUpdate.map((preset) => {
            updatePreset(preset);
        });

        presetsToCreate.map((preset) => {
            createPreset(preset);
        });
    } else {
        Logger.warning("There are no presets for this component.");
    }
};

export default _resolvePresets;
