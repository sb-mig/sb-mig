import type { RequestBaseConfig } from "./utils/request.js";

import Logger from "../utils/logger.js";
import { buildUrl } from "../utils/url-utils.js";

type GetAllStories = (
    args: {
        spaceId: string;
        storiesFilename?: string;
    },
    config: RequestBaseConfig,
) => Promise<any>;

const getAllStories: GetAllStories = async (args, config) => {
    const { spaceId, storiesFilename } = args;

    Logger.warning("Trying to get all stories from Content Hub...");
    if (!config.contentHubOriginUrl) {
        throw new Error("contentHubOriginUrl is required to fetch stories.");
    }

    const url = buildUrl({
        baseUrl: config.contentHubOriginUrl,
        pathname: "getStories",
        searchParams: {
            spaceId,
            ...(storiesFilename ? { storiesFilename } : {}),
        },
    });
    const authorizationToken = config.contentHubAuthorizationToken;
    if (config.debug) {
        console.log("This is url: ", url.toString());
    }

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: authorizationToken as string,
            },
        });

        if (!response.ok) {
            throw new Error(`Error fetching stories: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching stories:", error);
        throw error;
    }
};

export const contentHubApi = { getAllStories };
