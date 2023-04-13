import StoryblokClient from "storyblok-js-client";

import storyblokConfig from "../config/config.js";

const {
    accessToken,
    oauthToken,
    storyblokApiUrl,
    storyblokDeliveryApiUrl,
    rateLimit,
} = storyblokConfig;
export const sbApi = new StoryblokClient(
    {
        accessToken,
        oauthToken,
        rateLimit: rateLimit,
        cache: {
            clear: "auto",
            type: "none",
        },
    },
    storyblokApiUrl
);

export const sbDeliveryApi = new StoryblokClient(
    {
        accessToken,
        rateLimit: rateLimit,
        cache: {
            clear: "auto",
            type: "none",
        },
    },
    storyblokDeliveryApiUrl
);
