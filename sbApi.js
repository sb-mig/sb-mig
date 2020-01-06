const StoryblokClient = require("storyblok-js-client");
const { accessToken, oauthToken } = require("./config");

const sbApi = new StoryblokClient({ accessToken, oauthToken });

module.exports = sbApi;
