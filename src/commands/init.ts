import Logger from "../utils/logger.js";
import { unpackElements } from "../utils/main.js";
import * as fs from "fs";
import storyblokConfig from "../config/config.js";
import { v4 as uuidv4 } from "uuid";

import {
    removeAllComponents,
    syncAllComponents,
    syncProvidedComponents,
} from "../api/migrate.js";
import { CLIOptions } from "../utils/interfaces.js";
import { getSpace, updateSpace } from "../api/spaces.js";

const INIT_COMMANDS = {
    project: "project",
};

export const init = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case INIT_COMMANDS.project:
            Logger.warning(`init project... with command: ${command}`);

            const spaceId = flags["spaceid"];
            const oauthToken = flags["oauthtoken"];

            console.log({ spaceId, oauthToken });

            const spaceData = await getSpace({ spaceId });

            const STORYBLOK_SPACE_ID = spaceId;
            const NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN =
                spaceData.space.first_token;
            const STORYBLOK_PREVIEW_SECRET = uuidv4();
            const STORYBLOK_OAUTH_TOKEN = oauthToken;

            const envFileContent =
                `STORYBLOK_SPACE_ID=${STORYBLOK_SPACE_ID}\n` +
                `NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN=${NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN}\n` +
                `STORYBLOK_PREVIEW_SECRET=${STORYBLOK_PREVIEW_SECRET}\n` +
                `STORYBLOK_OAUTH_TOKEN=${STORYBLOK_OAUTH_TOKEN}\n`;

            try {
                const response = await fs.promises.writeFile(
                    ".env",
                    envFileContent
                );
                console.log(response);
            } catch (e) {
                console.error("Something happened while writing to env file");
                console.log(e);
            }

            try {
                await updateSpace({
                    spaceId,
                    params: {
                        domain: `https://localhost:3000/api/preview/preview?secret=${STORYBLOK_PREVIEW_SECRET}&slug=`,
                    },
                });
            } catch (e) {
                console.error("Something happened while updating space");
                console.log(e);
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
