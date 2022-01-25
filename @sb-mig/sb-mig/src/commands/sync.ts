import Logger from "../utils/logger.js";
import { unpackElements } from "../utils/main.js";
import storyblokConfig from "../config/config.js";
import { syncAllComponents, syncProvidedComponents } from "../api/migrate.js";
import { CLIOptions } from "../utils/interfaces.js";
import { syncAllRoles, syncProvidedRoles } from "../api/roles.js";
import {
    syncAllDatasources,
    syncProvidedDatasources,
} from "../api/datasources.js";

const SYNC_COMMANDS = {
    components: "components",
    roles: "roles",
    datasources: "datasources",
};

export const sync = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case SYNC_COMMANDS.components:
            Logger.warning(`sync components... with command: ${command}`);

            if (flags["all"]) {
                Logger.log(
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`
                );

                const presets = flags["presets"] || false;

                syncAllComponents({ presets });
            }

            if (!flags["all"]) {
                Logger.warning("Synchronizing PROVIDED componensdt...");
                const componentsToSync = unpackElements(input);

                syncProvidedComponents({
                    components: componentsToSync,
                    presets: Boolean(flags.presets),
                    packageName: flags.packageName,
                });
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
        default:
            console.log(`no command like that: ${command}`);
    }
};
