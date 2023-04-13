import type { CLIOptions } from "../utils/interfaces.js";

import {
    removeAllComponents,
    removeAllStories,
    removeSpecifiedComponents,
    syncProvidedComponents,
} from "../api/migrate.js";
import Logger from "../utils/logger.js";
import { unpackElements } from "../utils/main.js";

const REMOVE_COMMANDS = {
    story: "story",
    components: "components",
    roles: "roles",
    datasources: "datasources",
};

export const remove = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case REMOVE_COMMANDS.components:
            if (flags["all"]) {
                Logger.warning("Removing ALL components from storyblok...");

                await removeAllComponents();
            }

            if (!flags["all"]) {
                Logger.warning("Removing PROVIDED components...");
                const componentToRemove = unpackElements(input);

                removeSpecifiedComponents({
                    components: componentToRemove,
                });
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
