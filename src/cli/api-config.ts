import type { RequestBaseConfig } from "../api/v2/utils/request.js";

import StoryblokClient from "storyblok-js-client";

import storyblokConfig from "../config/config.js";

const { accessToken, oauthToken, storyblokApiUrl, rateLimit } = storyblokConfig;

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

const generateApi = (custom: StoryblokClient) => custom;

export const sbApi = generateApi(
    storyblokConfig.sbApi ? storyblokConfig.sbApi() : globalSbapi
);

export const apiConfig: RequestBaseConfig = {
    spaceId: storyblokConfig.spaceId,
    sbApi: sbApi,
};
