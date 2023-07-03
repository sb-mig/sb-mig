import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";

const INIT_COMMANDS = {
    stories: "stories",
};

export const testCommand = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case INIT_COMMANDS.stories:
            Logger.warning(`test sb-mig... with command: ${command}`);

            console.log("This is api config");
            console.log(apiConfig);

            const allStories = await managementApi.stories.getAllStories(
                {
                    options: {
                        language: "de-de",
                    },
                },
                apiConfig
            );

            console.log("these are all stories");
            console.log(
                JSON.stringify(allStories[0].story.content.body, null, 2)
            );

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
