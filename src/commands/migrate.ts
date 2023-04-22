import type { MigrateFrom } from "../api/data-migration/component-data-migration.js";
import type { CLIOptions } from "../utils/interfaces.js";

import {
    migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories,
} from "../api/data-migration/component-data-migration.js";
import { backupStories } from "../api/stories.js";
import Logger from "../utils/logger.js";
import { isItFactory, unpackElements } from "../utils/main.js";
import { askForConfirmation } from "../utils/others.js";

const MIGRATE_COMMANDS = {
    content: "content",
};

export const migrate = async (props: CLIOptions) => {
    console.log("PRops");
    console.log(props);
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

    switch (command) {
        case MIGRATE_COMMANDS.content:
            Logger.log(`Migrating content with command: ${command}`);

            if (isIt("empty")) {
                const componentsToMigrate = unpackElements(input) || [""];

                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        await backupStories({
                            filename: `${flags["from"]}--backup`,
                            suffix: ".sb.stories",
                            spaceId: flags["from"],
                        });

                        const migrateFrom: MigrateFrom = "space";

                        // Migrating provided components
                        await migrateProvidedComponentsDataInStories({
                            from: flags["from"],
                            to: flags["to"],
                            migrateFrom,
                            componentsToMigrate,
                            migrationConfig: flags["migration"],
                        });
                    },
                    () => {
                        Logger.warning(
                            "Migration not started, exiting the program..."
                        );
                    },
                    flags["yes"]
                );
            } else if (isIt("all")) {
                console.log("migrating all!");
                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        // await backupStories({
                        //     filename: `${flags["from"]}--backup`,
                        //     suffix: ".sb.stories",
                        //     spaceId: flags["from"],
                        // });

                        const migrateFrom: MigrateFrom = flags["migrateFrom"];

                        // here we should migrate all
                        await migrateAllComponentsDataInStories({
                            from: flags["from"],
                            to: flags["to"],
                            migrateFrom,
                            migrationConfig: flags["migration"],
                        });
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
