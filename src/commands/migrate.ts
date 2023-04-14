import type { CLIOptions } from "../utils/interfaces.js";

import Logger from "../utils/logger.js";
import { isItFactory } from "../utils/main.js";
import { askForConfirmation } from "../utils/others.js";

const MIGRATE_COMMANDS = {
    content: "content",
};

export const migrate = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        empty: [],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "pageId",
        "migration",
        "yes",
    ]);

    switch (command) {
        case MIGRATE_COMMANDS.content:
            Logger.log(`Migrating content with command: ${command}`);

            console.log("############");
            console.log({
                ...flags,
            });
            console.log("############");

            if (isIt("empty")) {
                await askForConfirmation(
                    "Are you sure you want to MIGRATE content (stories) in your space ?",
                    async () => {
                        Logger.warning("Preparing to migrate...");
                        Logger.log("Backing up current space data...");

                        // Backup all stories to file
                        // await syncContent({
                        //     type: "stories",
                        //     transmission: {
                        //         from: to,
                        //         to: `${to}_stories-backup`,
                        //     },
                        //     syncDirection: "fromSpaceToFile",
                        // });

                        // here we should migrate stuff
                    },
                    () => {
                        Logger.success(
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
