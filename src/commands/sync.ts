import Logger from "../utils/logger.js";
import readline from "node:readline/promises";
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
import chalk from "chalk";

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

                await removeAllComponents();
                syncAllComponents({ presets });
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

                    // This section has to be changed, it was fast solution to asking for confirmation
                    // need to reimplement it better
                    await new Promise((resolve) => {
                        setTimeout(() => {
                            console.log(" ");
                            console.log(" ");
                            resolve(true);
                        }, 3000);
                    });

                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                        prompt: chalk.red(
                            "Are you sure you want to delete all stories in your space and then apply test ones ? (y/n) > "
                        ),
                    });

                    rl.prompt();
                    for await (const deletionConfirmation of rl) {
                        if (deletionConfirmation.trim() !== "y") {
                            Logger.success(
                                "Stories not deleted, exiting the program..."
                            );
                            process.exit(0);
                        } else {
                            if (deletionConfirmation) {
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

                                break;
                            }
                        }
                        rl.prompt();
                    }
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
