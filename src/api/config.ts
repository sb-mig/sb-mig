import StoryblokClient from "storyblok-js-client";
import storyblokConfig from "../config/config.js";

const { accessToken, oauthToken, storyblokApiUrl } = storyblokConfig;
export const sbApi = new StoryblokClient(
    { accessToken, oauthToken },
    storyblokApiUrl
);
