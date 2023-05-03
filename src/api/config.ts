import StoryblokClient from "storyblok-js-client";

import storyblokConfig from "../config/config.js";

const {
    accessToken,
    oauthToken,
    storyblokApiUrl,
    storyblokDeliveryApiUrl,
    rateLimit,
} = storyblokConfig;

const generateApi = (custom: StoryblokClient) => custom;

const globalSbapi = new StoryblokClient(
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

export const sbApi = generateApi(
    storyblokConfig.sbApi ? storyblokConfig.sbApi() : globalSbapi
);

// export const sbApi = new StoryblokClient(
//     {
//         accessToken,
//         oauthToken,
//         rateLimit: rateLimit,
//         cache: {
//             clear: "auto",
//             type: "none",
//         },
//     },
//     storyblokApiUrl
// )

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
