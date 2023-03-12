import StoryblokClient from "storyblok-js-client";
import storyblokConfig from "../config/config.js";

const { accessToken, oauthToken, storyblokApiUrl, rateLimit } = storyblokConfig;
export const sbApi = new StoryblokClient(
    { accessToken, oauthToken, rateLimit: rateLimit },
    storyblokApiUrl
);
