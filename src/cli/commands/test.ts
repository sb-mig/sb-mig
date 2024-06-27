import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import Logger from "../../utils/logger.js";
import { getFileContentWithRequire } from "../../utils/main.js";
import { apiConfig } from "../api-config.js";
import { discoverResolvers, LOOKUP_TYPE, SCOPE } from "../utils/discover.js";

const INIT_COMMANDS = {
    stories: "stories",
    resolvers: "resolvers",
};

const testResolvers = async () => {
    Logger.warning(`test sb-mig... with command: ${INIT_COMMANDS.resolvers}`);
    const resolversFilenames = await discoverResolvers({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });
    console.log(resolversFilenames);

    /*
     * if resolversFilenames exist, then do stuff if not, than follow with the old approach
     * */
    if (resolversFilenames.length !== 0) {
        const resolverFilesContent = await Promise.all(
            resolversFilenames.map((filename) => {
                return getFileContentWithRequire({ file: filename });
            }),
        );
        console.log(resolverFilesContent);
    }
};

export const testCommand = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case INIT_COMMANDS.resolvers:
            testResolvers();
            break;
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
                apiConfig,
            );

            console.log("these are all stories");
            console.log(
                JSON.stringify(allStories[0].story.content.body, null, 2),
            );

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
