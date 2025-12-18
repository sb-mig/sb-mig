import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import { getFilesContentWithRequire } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import { askForConfirmation } from "../helpers.js";
import { isItFactory, getFrom, getTo } from "../utils/cli-utils.js";
import { discoverStories, LOOKUP_TYPE, SCOPE } from "../utils/discover.js";

const REVERT_COMMANDS = {
    content: "content",
};

export const revert = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        empty: [],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "to",
        "from",
        "pageId",
        "yes",
    ]);

    switch (command) {
        case REVERT_COMMANDS.content:
            if (isIt("empty")) {
                Logger.log(`Revert content migration with command: ${command}`);

                const from = getFrom(flags, apiConfig);
                const to = getTo(flags, apiConfig);

                await askForConfirmation(
                    "Are you sure you want to revert migration of content (stories) in your space ? (it will overwrite stories)",
                    async () => {
                        Logger.warning("Preparing to migrate...");

                        await managementApi.stories.backupStories(
                            {
                                filename: `${to}--backup-before-revert`,
                                suffix: ".sb.stories",
                                spaceId: to,
                            },
                            apiConfig,
                        );

                        const allLocalStories = discoverStories({
                            scope: SCOPE.local,
                            type: LOOKUP_TYPE.fileName,
                            fileNames: [from],
                        });

                        const stories = getFilesContentWithRequire({
                            files: allLocalStories,
                        });

                        await managementApi.stories.updateStories(
                            {
                                stories,
                                spaceId: to,
                                options: { publish: false },
                            },
                            apiConfig,
                        );
                    },
                    () => {
                        Logger.warning(
                            "Migration not started, exiting the program...",
                        );
                    },
                    flags["yes"],
                );
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info.",
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
