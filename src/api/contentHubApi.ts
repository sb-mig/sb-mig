import config from "../config/config.js";
import Logger from "../utils/logger.js";

const getAllStories = async ({
    spaceId,
    storiesFilename = "default",
}: {
    spaceId: string;
    storiesFilename?: string;
}) => {
    Logger.warning("Trying to get all stories from Content Hub...");
    const queryParams = `spaceId=${spaceId}&storiesFilename=${storiesFilename}`;
    const url = `${config.contentHubOriginUrl}/getStories?${queryParams}`;
    const authorizationToken = config.contentHubAuthorizationToken;
    if (config.debug) {
        console.log("This is url: ", url);
    }

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: authorizationToken,
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
