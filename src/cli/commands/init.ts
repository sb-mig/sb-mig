import type { CLIOptions } from "../../utils/interfaces.js";

import * as fs from "fs";

import StoryblokClient from "storyblok-js-client";
import { v4 as uuidv4 } from "uuid";

import { getSpace, updateSpace } from "../../api/spaces/index.js";
import storyblokConfig from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";

const INIT_COMMANDS = {
    project: "project",
};

export const init = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case INIT_COMMANDS.project:
            Logger.warning(`init project... with command: ${command}`);

            const { spaceId, oauthToken, gtmToken } = flags;
            const { storyblokApiUrl } = storyblokConfig;

            Logger.warning(
                "Updating space and creating .env file with provided options"
            );
            console.log({
                spaceId,
                oauthToken,
                gtmToken,
            });

            const localSbApi = new StoryblokClient(
                { oauthToken },
                storyblokApiUrl
            );

            const spaceData = await getSpace(spaceId, apiConfig);

            const STORYBLOK_SPACE_ID = spaceId;
            const STORYBLOK_OAUTH_TOKEN = oauthToken;
            const NEXT_PUBLIC_GTM_ID = gtmToken ?? "put-your-gtm-token-here";
            const NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN =
                spaceData.space.first_token;
            const STORYBLOK_PREVIEW_SECRET = uuidv4();

            const envFileContent =
                `STORYBLOK_SPACE_ID=${STORYBLOK_SPACE_ID}\n` +
                `NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN=${NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN}\n` +
                `STORYBLOK_PREVIEW_SECRET=${STORYBLOK_PREVIEW_SECRET}\n` +
                `STORYBLOK_OAUTH_TOKEN=${STORYBLOK_OAUTH_TOKEN}\n` +
                `NEXT_PUBLIC_GTM_ID=${NEXT_PUBLIC_GTM_ID}\n` +
                `NEXT_PUBLIC_TRANSLATION_STRATEGY=folder\n`;

            console.log("Envs that we will create: ");
            console.log(envFileContent);

            try {
                const response = await fs.promises.writeFile(
                    ".env",
                    envFileContent
                );
                Logger.success("Successfully created .env file");
            } catch (e) {
                console.error("Something happened while writing to env file");
                console.log(e);
            }

            try {
                await updateSpace(
                    {
                        spaceId,
                        params: {
                            domain: `https://localhost:3000/api/preview/preview?secret=${STORYBLOK_PREVIEW_SECRET}&slug=`,
                        },
                    },
                    apiConfig
                );
                Logger.success("Successfully updated space domain");
            } catch (e) {
                console.error("Something happened while updating space");
                console.log(e);
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
