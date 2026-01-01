import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import { backupStories } from "../../api/stories/backup.js";
import storyblokConfig from "../../config/config.js";
import { createAndSaveToFile, getPackageJson } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { extractFields } from "../../utils/object-utils.js";
import { apiConfig } from "../api-config.js";
import { isItFactory, unpackOne } from "../utils/cli-utils.js";

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

    const rules = {
        all: ["all"],
        empty: [],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "filename",
        "syncDirection",
        "from",
        "to",
        "presets",
        "packageName",
        "yes",
    ]);

    switch (command) {
        case BACKUP_COMMANDS.components:
            Logger.warning(`back up components... with command: ${command}`);
            if (flags["all"]) {
                managementApi.components
                    .getAllComponents(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-components",
                                datestamp: true,
                                res,
                                folder: "components",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        console.error("error happened... :(");
                    });
            }
            if (isIt("empty")) {
                const componentToBackup = unpackOne(input);

                managementApi.components
                    .getComponent(componentToBackup, apiConfig)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile(
                                {
                                    ext: "json",
                                    prefix: "component-",
                                    filename: componentToBackup,
                                    datestamp: true,
                                    res,
                                    folder: "components",
                                },
                                apiConfig,
                            );
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
                backupStories(
                    {
                        filename: "all-stories-backup",
                        suffix: ".stories",
                        spaceId: storyblokConfig.spaceId,
                    },
                    apiConfig,
                );
            }

            break;
        case BACKUP_COMMANDS.componentGroups:
            if (flags["all"]) {
                managementApi.components
                    .getAllComponentsGroups(apiConfig)
                    .then(async (res) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-component_groups",
                                datestamp: true,
                                res,
                                folder: "component-groups",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (isIt("empty")) {
                const componentGroupToBackup = unpackOne(input);

                managementApi.components
                    .getComponentsGroup(componentGroupToBackup, apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "component_group-",
                                datestamp: true,
                                filename: componentGroupToBackup,
                                res,
                                folder: "component-groups",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.datasources:
            if (flags["all"]) {
                managementApi.datasources
                    .getAllDatasources(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-datasources",
                                datestamp: true,
                                res,
                                folder: "datasources",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (isIt("empty")) {
                const datasourceToBackup = unpackOne(input);

                managementApi.datasources
                    .getDatasource(
                        { datasourceName: datasourceToBackup },
                        apiConfig,
                    )
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile(
                                {
                                    ext: "json",
                                    prefix: "datasources-",
                                    filename: datasourceToBackup,
                                    datestamp: true,
                                    res,
                                    folder: "datasources",
                                },
                                apiConfig,
                            );
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
                managementApi.roles
                    .getAllRoles(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-roles",
                                datestamp: true,
                                res,
                                folder: "roles",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (isIt("empty")) {
                const roleToBackup = unpackOne(input);

                managementApi.roles
                    .getRole(roleToBackup, apiConfig)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile(
                                {
                                    ext: "json",
                                    prefix: "role-",
                                    filename: roleToBackup,
                                    datestamp: true,
                                    res,
                                    folder: "roles",
                                },
                                apiConfig,
                            );
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
                managementApi.presets
                    .getAllPresets(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-presets-",
                                datestamp: true,
                                res,
                                folder: "presets",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            if (isIt("empty")) {
                const presetToBackup = unpackOne(input);

                managementApi.presets
                    .getPreset({ presetId: presetToBackup }, apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "preset-",
                                filename: presetToBackup,
                                datestamp: true,
                                res,
                                folder: "presets",
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            }
            break;
        case BACKUP_COMMANDS.componentPresets:
            if (isIt("empty")) {
                const componentPresetToBackup = unpackOne(input);

                managementApi.presets
                    .getComponentPresets(componentPresetToBackup, apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                filename: `${componentPresetToBackup}.presets.sb.json`,
                                res,
                                folder: storyblokConfig.presetsBackupDirectory,
                            },
                            apiConfig,
                        );
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });
            } else if (flags["all"]) {
                const allRemoteComponents =
                    await managementApi.components.getAllComponents(apiConfig);
                let metadata = {};

                if (flags["metadata"]) {
                    const pkgJson = getPackageJson();
                    metadata = {
                        metadata: extractFields(
                            pkgJson,
                            storyblokConfig.metadataSelection,
                        ),
                    };
                }

                allRemoteComponents.forEach(async (component: any) => {
                    managementApi.presets
                        .getComponentPresets(component.name, apiConfig)
                        .then(async (res: any) => {
                            if (res) {
                                await createAndSaveToFile(
                                    {
                                        ext: "json",
                                        filename: `${component.name}.presets.sb`,
                                        res: { allPresets: res, ...metadata },
                                        folder: storyblokConfig.presetsBackupDirectory,
                                    },
                                    {
                                        ...apiConfig,
                                        sbmigWorkingDirectory: ".",
                                    },
                                );
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
            if (isIt("empty")) {
                const pluginToBackup = unpackOne(input);

                managementApi.plugins
                    .getPlugin(pluginToBackup, apiConfig)
                    .then(async (res: any) => {
                        if (res) {
                            await createAndSaveToFile(
                                {
                                    ext: "json",
                                    prefix: "plugin-",
                                    filename: pluginToBackup,
                                    datestamp: true,
                                    res,
                                    folder: "plugins",
                                },
                                apiConfig,
                            );
                        }
                    })
                    .catch((err: any) => {
                        console.log(err);
                        Logger.error("error happened... :(");
                    });

                Logger.log("Backing up provided plugins...");
            }

            if (flags["all"]) {
                managementApi.plugins
                    .getAllPlugins(apiConfig)
                    .then(async (res: any) => {
                        await createAndSaveToFile(
                            {
                                ext: "json",
                                prefix: "all-plugins-",
                                datestamp: true,
                                res,
                                folder: "plugins",
                            },
                            apiConfig,
                        );
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
