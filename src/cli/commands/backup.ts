import type { RequestBaseConfig } from "../../api/v2/utils/request.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import { getComponentPresets } from "../../api/componentPresets.js";
import {
    getAllComponents,
    getAllComponentsGroups,
    getComponent,
    getComponentsGroup,
} from "../../api/components.js";
import { sbApi } from "../../api/config.js";
import {
    getAllDatasources,
    getDatasource,
} from "../../api/datasources/datasources.js";
import { backupStories } from "../../api/stories.js";
import { getAllPlugins, getPlugin } from "../../api/v2/plugins.js";
import { getAllPresets, getPreset } from "../../api/v2/presets/presets";
import { getAllRoles, getRole } from "../../api/v2/roles.js";
import storyblokConfig from "../../config/config.js";
import {
    createAndSavePresetToFile,
    createAndSaveToFile,
} from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { extractFields, getPackageJson, unpackOne } from "../../utils/main.js";

const BACKUP_COMMANDS = {
    components: "components",
    stories: "stories",
    componentGroups: "component-groups",
    datasources: "datasources",
    presets: "presets",
    componentPresets: "component-presets",
    roles: "roles",
    plugins: "plugins",
};

export const backup = async (props: CLIOptions) => {
    const { input, flags } = props;

    const apiConfig: RequestBaseConfig = {
        spaceId: storyblokConfig.spaceId,
        sbApi: sbApi,
    };

    const command = input[1];

    switch (command) {
        case BACKUP_COMMANDS.components:
            Logger.warning(`back up components... with command: ${command}`);
            if (flags["all"]) {
                getAllComponents()
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "all-components-",
                            folder: "components",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        console.error("error happened... :(");
                    });
            }
            if (flags["one"]) {
                const componentToBackup = unpackOne(input);

                getComponent(componentToBackup)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile({
                                prefix: "component-",
                                folder: "components",
                                res,
                            });
                        }
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }

            break;
        case BACKUP_COMMANDS.stories:
            Logger.warning(`back up stories... with command: ${command}`);
            if (flags["all"]) {
                backupStories({
                    filename: "all-stories-backup",
                    suffix: ".stories",
                    spaceId: storyblokConfig.spaceId,
                });
            }

            break;
        case BACKUP_COMMANDS.componentGroups:
            if (flags["all"]) {
                getAllComponentsGroups()
                    .then(async (res) => {
                        await createAndSaveToFile({
                            prefix: "all-component_groups-",
                            folder: "component_groups",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (flags["one"]) {
                const componentGroupToBackup = unpackOne(input);

                getComponentsGroup(componentGroupToBackup)
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "components_group-",
                            folder: "component_groups",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.datasources:
            if (flags["all"]) {
                getAllDatasources()
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "all-datasources-",
                            folder: "datasources",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (flags["one"]) {
                const datasourceToBackup = unpackOne(input);

                getDatasource(datasourceToBackup)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile({
                                prefix: `datasource-${datasourceToBackup}-`,
                                folder: "datasources",
                                res,
                            });
                        }
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.roles:
            if (flags["all"]) {
                getAllRoles(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "all-roles-",
                            folder: "roles",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (flags["one"]) {
                const roleToBackup = unpackOne(input);

                getRole(roleToBackup, apiConfig)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile({
                                prefix: `role-${roleToBackup}`,
                                folder: "roles",
                                res,
                            });
                        }
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.presets:
            if (flags["all"]) {
                getAllPresets(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "all-presets-",
                            folder: "presets",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (flags["one"]) {
                const presetToBackup = unpackOne(input);

                getPreset(presetToBackup, apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: `preset-${presetToBackup}-`,
                            folder: "presets",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.componentPresets:
            if (flags["one"]) {
                const componentPresetToBackup = unpackOne(input);

                getComponentPresets(componentPresetToBackup)
                    .then(async (res: any) => {
                        await createAndSavePresetToFile({
                            filename: `${componentPresetToBackup}.presets.sb.json`,
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            } else if (flags["all"]) {
                const allRemoteComponents = await getAllComponents();
                let metadata = {};

                if (flags["metadata"]) {
                    const pkgJson = getPackageJson();
                    metadata = {
                        metadata: extractFields(
                            pkgJson,
                            storyblokConfig.metadataSelection
                        ),
                    };
                }

                allRemoteComponents.forEach(async (component: any) => {
                    getComponentPresets(component.name)
                        .then(async (res: any) => {
                            if (res) {
                                await createAndSavePresetToFile({
                                    filename: `${component.name}.presets.sb.json`,
                                    res: { allPresets: res, ...metadata },
                                });
                            }
                        })
                        .catch((err: any) => {
                            console.log(err);
                            Logger.error("error happened... :(");
                        });
                });
            }
            break;
        case BACKUP_COMMANDS.plugins:
            if (flags["one"]) {
                const pluginToBackup = unpackOne(input);

                getPlugin(pluginToBackup, apiConfig)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile({
                                prefix: `plugin-${pluginToBackup}-`,
                                folder: "plugins",
                                res,
                            });
                        }
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }

            if (flags["all"]) {
                getAllPlugins(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile({
                            prefix: "all-plugins-",
                            folder: "plugins",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
                return;
            }
            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
