import type { RequestBaseConfig } from "../../api/v2/utils/request";
import type { CLIOptions } from "../../utils/interfaces.js";

import { sbApi } from "../../api/config";
import { removeAllStories } from "../../api/migrate.js";
import {
    removeAllComponents,
    removeSpecifiedComponents,
} from "../../api/v2/migrate";
import storyblokConfig from "../../config/config";
import Logger from "../../utils/logger.js";
import { unpackElements } from "../../utils/main.js";

const REMOVE_COMMANDS = {
    story: "story",
    components: "components",
    roles: "roles",
    datasources: "datasources",
};

export const remove = async (props: CLIOptions) => {
    const { input, flags } = props;

    const apiConfig: RequestBaseConfig = {
        spaceId: storyblokConfig.spaceId,
        sbApi: sbApi,
    };

    const command = input[1];

    switch (command) {
        case REMOVE_COMMANDS.components:
            if (flags["all"]) {
                Logger.warning("Removing ALL components from storyblok...");

                await removeAllComponents(apiConfig);
            }

            if (!flags["all"]) {
                Logger.warning("Removing PROVIDED components...");
                const componentToRemove = unpackElements(input);

                removeSpecifiedComponents(
                    {
                        components: componentToRemove,
                    },
                    apiConfig
                );
            }

            break;
        case REMOVE_COMMANDS.roles:
            Logger.warning(`No functionality so far - v5 approaching`);

            break;

        case REMOVE_COMMANDS.datasources:
            Logger.warning(`No functionality so far - v5 approaching`);

            break;

        case REMOVE_COMMANDS.story:
            Logger.warning(`Removing all stories from: ${flags.from}`);

            if (flags["all"] && flags["from"]) {
                await removeAllStories({ spaceId: flags.from });
            }

            break;
        default:
            Logger.log(`no command like that: ${command}`);
    }
};
