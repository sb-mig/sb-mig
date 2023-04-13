import type { CLIOptions } from "../utils/interfaces.js";

import { getComponentPresets } from "../api/componentPresets.js";
import {
    getAllComponents,
    getAllComponentsGroups,
    getComponent,
    getComponentsGroup,
} from "../api/components.js";
import {
    getAllDatasources,
    getDatasource,
} from "../api/datasources/datasources.js";
import { getAllPlugins, getPlugin } from "../api/plugins.js";
import { getAllPresets, getPreset } from "../api/presets.js";
import { getAllRoles, getRole } from "../api/roles.js";
import { backupStories, getStoryBySlug } from "../api/stories.js";
import storyblokConfig from "../config/config.js";
import {
    createAndSaveToFile,
    createAndSaveToStoriesFile,
} from "../utils/files.js";
import Logger from "../utils/logger.js";
import { unpackOne } from "../utils/main.js";

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
                getAllRoles()
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

                getRole(roleToBackup)
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
                getAllPresets()
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

                getPreset(presetToBackup)
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
                        await createAndSaveToFile({
                            prefix: `component-preset-${componentPresetToBackup}-`,
                            folder: "component-presets",
                            res,
                        });
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.plugins:
            if (flags["one"]) {
                const pluginToBackup = unpackOne(input);

                getPlugin(pluginToBackup)
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
                getAllPlugins()
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
