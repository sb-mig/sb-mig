import type { MigrateFrom } from "../../api/data-migration/component-data-migration.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import {
    migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories,
} from "../../api/data-migration/component-data-migration.js";
import { managementApi } from "../../api/managementApi.js";
import { backupStories } from "../../api/stories/backup.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { isItFactory, unpackElements } from "../../utils/main.js";
import { askForConfirmation, getFrom, getTo } from "../../utils/others.js";
import { apiConfig } from "../api-config.js";

const MIGRATE_COMMANDS = {
    content: "content",
    presets: "presets",
};

export const migrate = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        empty: [],
        all: ["all", "migrateFrom"],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "to",
        "from",
        "pageId",
        "migration",
        "yes",
    ]);

    Logger.warning(
        `This feature is in BETA. Use it at your own risk. The API might change in the future. (Probably in a standard Prisma like migration way)`
    );

    switch (command) {
        case MIGRATE_COMMANDS.content: {
            Logger.log(`Migrating content with command: ${command}`);

            const from = getFrom(flags);
            const to = getTo(flags);
            const migrationConfig = flags["migration"];

            if (isIt("empty")) {
                const componentsToMigrate = unpackElements(input) || [""];

                const migrateFrom: MigrateFrom = "space";

                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        await backupStories(
                            {
                                filename: `${from}--backup-before-migration___${migrationConfig}`,
                                suffix: ".sb.stories",
                                spaceId: from,
                            },
                            apiConfig
                        );

                        // Migrating provided components
                        await migrateProvidedComponentsDataInStories(
                            {
                                itemType: "story",
                                from,
                                to,
                                migrateFrom,
                                componentsToMigrate,
                                migrationConfig,
                            },
                            apiConfig
                        );
                    },
                    () => {
                        Logger.warning(
                            "Migration not started, exiting the program..."
                        );
                    },
                    flags["yes"]
                );
            } else if (isIt("all")) {
                const migrateFrom: MigrateFrom = flags["migrateFrom"];
                const dryRun = flags["dryRun"];

                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        await migrateAllComponentsDataInStories(
                            {
                                itemType: "story",
                                from,
                                to,
                                migrateFrom,
                                migrationConfig,
                            },
                            apiConfig
                        );
                    },
                    () => {
                        Logger.warning(
                            "Migration not started, exiting the program..."
                        );
                    },
                    flags["yes"]
                );
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info."
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        }
        case MIGRATE_COMMANDS.presets: {
            Logger.log(`Migrating content with command: ${command}`);

            const from = getFrom(flags);
            const to = getTo(flags);
            const migrationConfig = flags["migration"];
            console.log("Migrating with presets");

            if (isIt("all")) {
                const migrateFrom: MigrateFrom = flags["migrateFrom"];
                const dryRun = flags["dryRun"];

                await askForConfirmation(
                    "Are you sure you want to MIGRATE presets in your space ? (it will overwrite them)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        const response =
                            await managementApi.presets.getAllPresets(
                                apiConfig
                            );

                        await createAndSaveToFile({
                            filename: "presets-backup",
                            res: response,
                        });

                        await migrateAllComponentsDataInStories(
                            {
                                itemType: "preset",
                                from,
                                to,
                                migrateFrom,
                                migrationConfig,
                            },
                            apiConfig
                        );
                    },
                    () => {
                        Logger.warning(
                            "Migration not started, exiting the program..."
                        );
                    },
                    flags["yes"]
                );
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info."
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        }
        default:
            console.log(`no command like that: ${command}`);
    }
};
