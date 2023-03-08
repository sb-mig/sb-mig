import Logger from "../utils/logger.js";
import { unpackElements } from "../utils/main.js";
import storyblokConfig from "../config/config.js";
import {
    removeAllComponents,
    syncAllComponents,
    syncContent,
    syncProvidedComponents,
    removeAllStories,
    syncProvidedPlugins,
} from "../api/migrate.js";
import { CLIOptions } from "../utils/interfaces.js";
import { syncAllRoles, syncProvidedRoles } from "../api/roles.js";
import {
    syncAllDatasources,
    syncProvidedDatasources,
} from "../api/datasources/datasources.js";
import { askForConfirmation } from "../utils/others.js";

const SYNC_COMMANDS = {
    story: "story",
    components: "components",
    roles: "roles",
    datasources: "datasources",
    plugins: "plugins",
};

export const sync = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case SYNC_COMMANDS.components:
            Logger.warning(`sync components... with command: ${command}`);

            if (flags["all"] && !flags["ssot"]) {
                Logger.log(
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`
                );

                const presets = flags["presets"] || false;

                syncAllComponents({ presets });
            }

            if (!flags["all"] && !flags["ssot"]) {
                Logger.warning("Synchronizing PROVIDED components...");
                const componentsToSync = unpackElements(input);

                syncProvidedComponents({
                    components: componentsToSync,
                    presets: Boolean(flags.presets),
                    packageName: flags.packageName,
                });
            }

            if (flags["ssot"] && flags["all"]) {
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
            if (flags["all"]) {
                Logger.log("Syncing all roles...");

                syncAllRoles();
            }

            if (!flags["all"]) {
                Logger.log("Syncing provided roles...");
                const rolesToSync = unpackElements(input);

                syncProvidedRoles({ roles: rolesToSync });
            }
            break;
        case SYNC_COMMANDS.datasources:
            if (flags["all"]) {
                Logger.log("Syncing all datasources with extension...");
                syncAllDatasources();
            }

            if (!flags["all"]) {
                Logger.log("Syncing provided datasources with extension...");
                const datasourcesToSync = unpackElements(input);

                syncProvidedDatasources({ datasources: datasourcesToSync });
            }
            break;
        case SYNC_COMMANDS.story:
            Logger.log(`Syncing story with command: ${command}`);

            if (flags["all"]) {
                if (!flags["from"] && !flags["to"]) {
                    Logger.warning(
                        `sync story... from boilerplateSpaceId: ${storyblokConfig.boilerplateSpaceId} to working dir spaceid: ${storyblokConfig.spaceId} with command: ${command}`
                    );

                    await askForConfirmation(
                        "Are you sure you want to delete all stories in your space and then apply test ones ?",
                        async () => {
                            Logger.warning(
                                "Deleting all stories in your space and then applying test ones..."
                            );

                            await removeAllStories({
                                spaceId: storyblokConfig.spaceId,
                            });
                            await syncContent({
                                from: storyblokConfig.boilerplateSpaceId,
                                to: storyblokConfig.spaceId,
                            });
                        },
                        () => {
                            Logger.success(
                                "Stories not deleted, exiting the program..."
                            );
                        },
                        flags["yes"]
                    );
                }

                if (flags["from"] && !flags["to"]) {
                    Logger.warning(
                        `sync story... from: ${flags.from} to working dir spaceid: ${storyblokConfig.spaceId} with command: ${command}`
                    );

                    await removeAllStories({
                        spaceId: storyblokConfig.spaceId,
                    });
                    await syncContent({
                        from: flags.from,
                        to: storyblokConfig.spaceId,
                    });
                }

                if (flags["from"] && flags["to"]) {
                    Logger.warning(
                        `sync story... from space-id: ${flags.from} to space-id: ${flags.to} with command: ${command}`
                    );

                    await removeAllStories({
                        spaceId: storyblokConfig.spaceId,
                    });
                    await syncContent({ from: flags.from, to: flags.to });
                }
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
