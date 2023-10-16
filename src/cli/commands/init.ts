import type { CLIOptions } from "../../utils/interfaces.js";

import * as fs from "fs";

import StoryblokClient from "storyblok-js-client";
import { v4 as uuidv4 } from "uuid";

import { managementApi } from "../../api/managementApi.js";
import { storyblokApiMapping } from "../../config/constants.js";
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

            const { spaceId, oauthToken, gtmToken, region } = flags as {
                spaceId: string;
                oauthToken: string;
                gtmToken: string | undefined;
                region: "us" | "eu" | "cn";
            };

            const storyblokManagementApiUrl =
                storyblokApiMapping[region].managementApi;
            const storyblokDeliveryApiUrl =
                storyblokApiMapping[region].deliveryApi;
            const storyblokGraphqlApiUrl = storyblokApiMapping[region].graphql;

            Logger.warning(
                "Updating space and creating .env file with provided options",
            );
            console.log({
                spaceId,
                oauthToken,
                gtmToken,
                region,
            });

            const localSbApi = new StoryblokClient(
                { oauthToken },
                storyblokManagementApiUrl,
            );

            console.log("This is api config: ");
            console.log({ ...apiConfig, oauthToken });

            const spaceData = await managementApi.spaces.getSpace(
                { spaceId },
                { ...apiConfig, sbApi: localSbApi },
            );

            const STORYBLOK_REGION = region;
            const STORYBLOK_GRAPHQL_API_URL = storyblokGraphqlApiUrl;
            const STORYBLOK_DELIVERY_API_URL = storyblokDeliveryApiUrl;
            const STORYBLOK_MANAGEMENT_API_URL = storyblokManagementApiUrl;
            const STORYBLOK_SPACE_ID = spaceId;
            const STORYBLOK_OAUTH_TOKEN = oauthToken;
            const NEXT_PUBLIC_GTM_ID = gtmToken ?? "put-your-gtm-token-here";
            const NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN =
                spaceData.space.first_token;
            const STORYBLOK_PREVIEW_SECRET = uuidv4();

            const envFileContent =
                `NEXT_PUBLIC_STORYBLOK_REGION=${STORYBLOK_REGION}\n` +
                `NEXT_PUBLIC_STORYBLOK_GRAPHQL_API_URL=${STORYBLOK_GRAPHQL_API_URL}\n` +
                `NEXT_PUBLIC_STORYBLOK_DELIVERY_API_URL=${STORYBLOK_DELIVERY_API_URL}\n` +
                `NEXT_PUBLIC_STORYBLOK_MANAGEMENT_API_URL=${STORYBLOK_MANAGEMENT_API_URL}\n` +
                `NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN=${NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN}\n` +
                `NEXT_PUBLIC_GTM_ID=${NEXT_PUBLIC_GTM_ID}\n` +
                `NEXT_PUBLIC_TRANSLATION_STRATEGY=folder\n` +
                `STORYBLOK_SPACE_ID=${STORYBLOK_SPACE_ID}\n` +
                `STORYBLOK_PREVIEW_SECRET=${STORYBLOK_PREVIEW_SECRET}\n` +
                `STORYBLOK_OAUTH_TOKEN=${STORYBLOK_OAUTH_TOKEN}\n`;

            console.log("Envs that we will create: ");
            console.log(envFileContent);

            try {
                const response = await fs.promises.writeFile(
                    ".env",
                    envFileContent,
                );
                Logger.success("Successfully created .env file");
            } catch (e) {
                console.error("Something happened while writing to env file");
                console.log(e);
            }

            try {
                await managementApi.spaces.updateSpace(
                    {
                        spaceId,
                        params: {
                            domain: `https://localhost:3000/api/preview/preview?secret=${STORYBLOK_PREVIEW_SECRET}&slug=`,
                        },
                    },
                    { ...apiConfig, sbApi: localSbApi },
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
