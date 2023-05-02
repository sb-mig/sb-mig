import type { CLIOptions } from "../utils/interfaces.js";
import type { SyncDirection } from "../utils/sync-utils.js";

import {
    syncAllDatasources,
    syncProvidedDatasources,
} from "../api/datasources/datasources.js";
import {
    removeAllComponents,
    syncAllComponents,
    syncContent,
    syncProvidedComponents,
    removeAllStories,
    syncProvidedPlugins,
} from "../api/migrate.js";
import { syncAllRoles, syncProvidedRoles } from "../api/roles.js";
import { backupStories } from "../api/stories.js";
import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";
import { isItFactory, unpackElements } from "../utils/main.js";
import { askForConfirmation, getFrom, getTo } from "../utils/others.js";
import { defineSyncDirection } from "../utils/sync-utils.js";

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
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`
                );

                const presets = flags["presets"] || false;

                syncAllComponents({ presets });
            }

            if (isIt("empty")) {
                Logger.warning("Synchronizing PROVIDED components...");
                const componentsToSync = unpackElements(input);

                syncProvidedComponents({
                    components: componentsToSync,
                    presets: Boolean(flags.presets),
                    packageName: flags.packageName,
                });
            }

            if (isIt("allWithSSOT")) {
                Logger.warning(
                    "Synchronizing ALL components as Single Source of Truth..."
                );
                const presets = flags["presets"] || false;

                await askForConfirmation(
                    "Are you sure you want to use Single Source of truth? It will remove all your components added in GUI and replace them 1 to 1 with code versions.",
                    async () => {
                        await removeAllComponents();
                        await syncAllComponents({ presets });
                    },
                    () => {
                        Logger.success("Syncing components aborted.");
                    },
                    flags["yes"]
                );
            }

            break;
        case SYNC_COMMANDS.roles:
            if (isIt("all")) {
                Logger.log("Syncing all roles...");

                syncAllRoles();
            }

            if (isIt("empty")) {
                Logger.log("Syncing provided roles...");
                const rolesToSync = unpackElements(input);

                syncProvidedRoles({ roles: rolesToSync });
            }
            break;
        case SYNC_COMMANDS.datasources:
            if (isIt("all")) {
                Logger.log("Syncing all datasources with extension...");
                syncAllDatasources();
            }

            if (!flags["all"]) {
                Logger.log("Syncing provided datasources with extension...");
                const datasourcesToSync = unpackElements(input);

                syncProvidedDatasources({ datasources: datasourcesToSync });
            }
            break;
        case SYNC_COMMANDS.content:
            Logger.log(`Syncing content with command: ${command}`);

            const from = getFrom(flags);
            const to = getTo(flags);

            Logger.warning(
                `sync story... from ${from} to working dir spaceid: ${to} with command: ${command}`
            );

            const syncDirection: SyncDirection =
                flags["syncDirection"] ||
                defineSyncDirection(Number(from), Number(to));

            console.log({
                from,
                to,
                ...flags,
                syncDirection,
            });

            if (isIt("all")) {
                await askForConfirmation(
                    "Are you sure you want to delete all content (stories) in your space and then apply test ones ?",
                    async () => {
                        Logger.warning(
                            "Deleting all stories in your space and then applying migrated ones..."
                        );

                        // Backup all stories to file
                        await syncContent({
                            type: "stories",
                            transmission: {
                                from: to,
                                to: `${to}_stories-backup`,
                            },
                            syncDirection: "fromSpaceToFile",
                        });

                        // Remove all stories from 'to' space
                        await removeAllStories({
                            spaceId: storyblokConfig.spaceId,
                        });

                        // Sync stories from 'from' space to 'to' space
                        await syncContent({
                            type: "stories",
                            transmission: { from, to },
                            syncDirection,
                        });

                        // Sync assets from 'from' space to 'to' space
                        await syncContent({
                            type: "assets",
                            transmission: { from, to },
                            syncDirection,
                        });
                    },
                    () => {
                        Logger.success(
                            "Stories not deleted, exiting the program..."
                        );
                    },
                    flags["yes"]
                );
            } else if (isIt("assets")) {
                Logger.warning(
                    `Syncing using sync direction: ${syncDirection}`
                );

                await syncContent({
                    type: "assets",
                    transmission: { from, to },
                    syncDirection,
                });
            } else if (isIt("stories")) {
                Logger.warning(
                    `Syncing using sync direction: ${syncDirection}`
                );

                console.log({
                    from,
                    to,
                    syncDirection,
                });

                if (syncDirection !== "fromSpaceToFile") {
                    await askForConfirmation(
                        "Are you sure you want to delete all stories in your space and then apply test ones ?",
                        async () => {
                            Logger.warning(
                                "Deleting all stories in your space and then applying test ones..."
                            );

                            // Backup all stories to file
                            await backupStories({
                                spaceId: to,
                                filename: `${to}_stories-backup`,
                                suffix: ".sb.stories",
                            });

                            // Remove all stories from 'to' space
                            await removeAllStories({
                                spaceId: to,
                            });

                            // Sync stories to 'to' space
                            await syncContent({
                                type: "stories",
                                transmission: { from, to },
                                syncDirection,
                                filename: flags["filename"],
                            });
                        },
                        () => {
                            Logger.success(
                                "Stories not deleted, exiting the program..."
                            );
                        },
                        flags["yes"]
                    );
                } else {
                    // Sync stories to 'to' space
                    await syncContent({
                        type: "stories",
                        transmission: { from, to },
                        syncDirection,
                    });
                }
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info."
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        case SYNC_COMMANDS.plugins:
            Logger.warning(`sync plugins... with command: ${command}`);

            if (!flags["all"]) {
                Logger.warning("Synchronizing PROVIDED plugins...");
                const pluginsToSync = unpackElements(input);

                syncProvidedPlugins({
                    plugins: pluginsToSync,
                });
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
