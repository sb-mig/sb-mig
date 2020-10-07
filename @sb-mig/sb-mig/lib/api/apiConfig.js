"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const StoryblokClient = require('storyblok-js-client');
const config_1 = require("../config/config");
const { accessToken, oauthToken, storyblokApiUrl } = config_1.default;
exports.sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl);
// export const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl) as Storyblok // after https://github.com/storyblok/storyblok-js-client/issues/50 will be solved
// export const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl)
