import Logger from "../utils/logger.js";
import * as fs from "fs";
import storyblokConfig from "../config/config.js";
import { v4 as uuidv4 } from "uuid";
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

            const { oauthToken, spaceId } = storyblokConfig; // this would be good to build readFile from .env file, so i have util for Raycast plugin
            const spaceData = await getSpace({ spaceId });

            const STORYBLOK_SPACE_ID = spaceId;
            const STORYBLOK_OAUTH_TOKEN = oauthToken;
            const NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN =
                spaceData.space.first_token;
            const STORYBLOK_PREVIEW_SECRET = uuidv4();

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
