import type { MigrateFrom } from "../../api/data-migration/component-data-migration.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import {
    migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories,
} from "../../api/data-migration/component-data-migration.js";
import { backupStories } from "../../api/v2/stories/backup.js";
import Logger from "../../utils/logger.js";
import { isItFactory, unpackElements } from "../../utils/main.js";
import { askForConfirmation, getFrom, getTo } from "../../utils/others.js";
import { apiConfig } from "../api-config.js";

const MIGRATE_COMMANDS = {
    content: "content",
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
        case MIGRATE_COMMANDS.content:
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

                console.log({
                    from,
                    to,
                    migrateFrom,
                    migrationConfig,
                    dryRun,
                });

                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        // await backupStories({
                        //     filename: `${from}--backup-before-migration___${migrationConfig}`,
                        //     suffix: ".sb.stories",
                        //     spaceId: from,
                        // });

                        await migrateAllComponentsDataInStories(
                            {
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
        default:
            console.log(`no command like that: ${command}`);
    }
};
