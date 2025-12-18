import type { CLIOptions } from "../../utils/interfaces.js";
import type { SyncDirection } from "../sync.types.js";

import { managementApi } from "../../api/managementApi.js";
import {
    removeAllComponents,
    syncAllComponents,
    syncContent,
    syncProvidedComponents,
    setComponentDefaultPreset,
} from "../../api/migrate.js";
import storyblokConfig from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { isItFactory, unpackElements } from "../../utils/main.js";
import { getFrom, getTo } from "../../utils/others.js";
import { apiConfig } from "../api-config.js";
import {
    syncAllDatasources,
    syncProvidedDatasources,
} from "../datasources/sync.js";
import { askForConfirmation } from "../helpers.js";
import { syncAllRoles, syncProvidedRoles } from "../roles/sync.js";

const SYNC_COMMANDS = {
    content: "content",
    components: "components",
    roles: "roles",
    datasources: "datasources",
    plugins: "plugins",
};

export const sync = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        all: ["all"],
        assets: ["assets"],
        stories: ["stories"],
        allWithSSOT: ["all", "ssot"],
        allWithPresets: ["all", "presets"],
        onlyPresets: ["presets"],
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
        case SYNC_COMMANDS.components:
            Logger.warning(`sync components... with command: ${command}`);

            if (isIt("all")) {
                Logger.log(
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`,
                );

                const presets = flags["presets"] || false;

                await syncAllComponents(presets, apiConfig);

                await setComponentDefaultPreset({
                    presets: Boolean(flags.presets),
                    apiConfig,
                });
            }

            if (isIt("empty")) {
                Logger.warning("Synchronizing PROVIDED components...");
                const componentsToSync = unpackElements(input);

                await syncProvidedComponents(
                    Boolean(flags.presets),
                    componentsToSync,
                    flags.packageName,
                    apiConfig,
                );

                await setComponentDefaultPreset({
                    presets: Boolean(flags.presets),
                    componentsToSync,
                    apiConfig,
                });
            }

            if (isIt("allWithSSOT")) {
                Logger.warning(
                    "Synchronizing ALL components as Single Source of Truth...",
                );
                const presets = flags["presets"] || false;

                await askForConfirmation(
                    "Are you sure you want to use Single Source of truth? It will remove all your components added in GUI and replace them 1 to 1 with code versions.",
                    async () => {
                        await removeAllComponents(apiConfig);
                        await syncAllComponents(presets, apiConfig);
                    },
                    () => {
                        Logger.success("Syncing components aborted.");
                    },
                    flags["yes"],
                );
            }

            break;
        case SYNC_COMMANDS.roles:
            if (isIt("all")) {
                Logger.log("Syncing all roles...");

                syncAllRoles(apiConfig);
            }

            if (isIt("empty")) {
                Logger.log("Syncing provided roles...");
                const rolesToSync = unpackElements(input);

                syncProvidedRoles({ roles: rolesToSync }, apiConfig);
            }
            break;
        case SYNC_COMMANDS.datasources:
            if (isIt("all")) {
                Logger.log("Syncing all datasources with extension...");
                syncAllDatasources(apiConfig);
            }

            if (!flags["all"]) {
                Logger.log("Syncing provided datasources with extension...");
                const datasourcesToSync = unpackElements(input);

                syncProvidedDatasources(
                    { datasources: datasourcesToSync },
                    apiConfig,
                );
            }
            break;
        case SYNC_COMMANDS.content:
            Logger.log(`Syncing content with command: ${command}`);

            const from = getFrom(flags, apiConfig);
            const to = getTo(flags, apiConfig);

            Logger.warning(
                `sync story... from ${from} to working dir spaceid: ${to} with command: ${command}`,
            );

            const syncDirection: SyncDirection = flags["syncDirection"];

            if (storyblokConfig.debug) {
                console.log({
                    from,
                    to,
                    ...flags,
                    syncDirection,
                });
            }


            if (syncDirection) {
                if (isIt("all")) {
                    if (syncDirection !== "fromSpaceToFile") {
                        await askForConfirmation(
                            "Are you sure you want to delete all content (stories) in your space and then apply new ones ?",
                            async () => {
                                Logger.warning(
                                    "Deleting all stories in your space and then applying migrated ones...",
                                );

                                // Backup all stories to file
                                await syncContent(
                                    {
                                        type: "stories",
                                        transmission: {
                                            from: to,
                                            to: `${to}_stories-backup`,
                                        },
                                        syncDirection: "fromSpaceToFile",
                                    },
                                    apiConfig,
                                );

                                // Remove all stories from 'to' space
                                await managementApi.stories.removeAllStories({
                                    ...apiConfig,
                                    spaceId: to,
                                });

                                // Sync stories from 'from' space to 'to' space
                                await syncContent(
                                    {
                                        type: "stories",
                                        transmission: { from, to },
                                        syncDirection,
                                    },
                                    apiConfig,
                                );

                                await syncContent(
                                    {
                                        type: "assets",
                                        transmission: { from, to },
                                        syncDirection,
                                    },
                                    apiConfig,
                                );
                            },
                            () => {
                                Logger.success(
                                    "Stories not deleted, exiting the program...",
                                );
                            },
                            flags["yes"],
                        );
                    } else {
                        await syncContent(
                            {
                                type: "stories",
                                transmission: { from, to },
                                syncDirection,
                                filename: flags.to,
                            },
                            apiConfig,
                        );

                        await syncContent(
                            {
                                type: "assets",
                                transmission: { from, to },
                                syncDirection,
                            },
                            apiConfig,
                        );
                    }
                } else if (isIt("assets")) {
                    Logger.warning(
                        `Syncing using sync direction: ${syncDirection}`,
                    );

                    await syncContent(
                        {
                            type: "assets",
                            transmission: { from, to },
                            syncDirection,
                        },
                        apiConfig,
                    );
                } else if (isIt("stories")) {
                    Logger.warning(
                        `Syncing using sync direction: ${syncDirection}`,
                    );

                    if (syncDirection !== "fromSpaceToFile") {
                        await askForConfirmation(
                            "Are you sure you want to delete all stories in your space and then apply new ones ?",
                            async () => {
                                Logger.warning(
                                    "Deleting all stories in your space and then applying test ones...",
                                );

                                // Backup all stories to file
                                await syncContent(
                                    {
                                        type: "stories",
                                        transmission: {
                                            from: to,
                                            to: `${to}_stories-backup`,
                                        },
                                        syncDirection: "fromSpaceToFile",
                                    },
                                    apiConfig,
                                );

                                // Remove all stories from 'to' space
                                await managementApi.stories.removeAllStories({
                                    ...apiConfig,
                                    spaceId: to,
                                });

                                //
                                // Sync stories to 'to' space
                                await syncContent(
                                    {
                                        type: "stories",
                                        transmission: { from, to },
                                        syncDirection,
                                    },
                                    apiConfig,
                                );
                            },
                            () => {
                                Logger.success(
                                    "Stories not deleted, exiting the program...",
                                );
                            },
                            flags["yes"],
                        );
                    } else {
                        // Sync stories to 'to' space
                        await syncContent(
                            {
                                type: "stories",
                                transmission: { from, to },
                                syncDirection,
                            },
                            apiConfig,
                        );
                    }
                } else {
                    Logger.error(
                        "Wrong combination of flags. check help for more info.",
                    );
                    console.log("Passed flags: ");
                    console.log(flags);
                }
            } else {
                console.log(
                    "You need to provide --syncDirection flag. With one of the following values:  fromSpaceToFile, fromFileToSpace, fromSpaceToSpace \n",
                );
            }

            break;
        case SYNC_COMMANDS.plugins:
            Logger.warning(`sync plugins... with command: ${command}`);

            if (!flags["all"]) {
                Logger.warning("Synchronizing PROVIDED plugins...");
                const pluginsToSync = unpackElements(input);

                await managementApi.plugins.syncProvidedPlugins(
                    {
                        plugins: pluginsToSync,
                    },
                    apiConfig,
                );
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
