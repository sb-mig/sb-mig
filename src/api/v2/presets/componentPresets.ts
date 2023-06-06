import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../../utils/logger.js";
import { managementApi } from "../managementApi.js";

import { getPreset } from "./presets.js";

export const getComponentPresets = (
    componentName: string | undefined,
    config: RequestBaseConfig
) => {
    Logger.log(`Trying to get all '${componentName}' presets.`);

    return managementApi.components
        .getAllComponents(config)
        .then(async (res) => {
            const componentPresets = res.filter(
                (component: any) => component.name === componentName
            );

            if (componentPresets.length > 0) {
                if (componentPresets[0].all_presets.length === 0) {
                    Logger.warning(
                        `There is no presets for: '${componentName}' component`
                    );
                    return false;
                }
                return Promise.all(
                    componentPresets[0].all_presets.map((preset: any) =>
                        getPreset(preset.id, config).catch((err: any) =>
                            Logger.error(err)
                        )
                    )
                );
            }
            Logger.warning(`There is no '${componentName}' component`);
            return false;
        });
};
