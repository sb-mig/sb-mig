import StoryblokClient from "storyblok-js-client";
import storyblokConfig from "../config/config.js";
import Storyblok from "storyblok-js-client";

const {
    accessToken,
    oauthToken,
    storyblokApiUrl,
    storyblokDeliveryApiUrl,
    rateLimit,
} = storyblokConfig;
export const sbApi = new StoryblokClient(
    { accessToken, oauthToken, rateLimit: rateLimit },
    storyblokApiUrl
);

export const sbDeliveryApi = new Storyblok(
    { accessToken, rateLimit: rateLimit },
    storyblokDeliveryApiUrl
);
