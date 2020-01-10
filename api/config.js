const StoryblokClient = require("storyblok-js-client");
const { oauthToken, githubToken, accessToken } = require("../config");

const headers = {
  "Content-Type": "application/json",
  Authorization: oauthToken
};

const githubHeaders = {
  ...headers,
  Authorization: `token ${githubToken}`
};

const sbApi = new StoryblokClient({ accessToken, oauthToken });

module.exports = {
  headers,
  githubHeaders,
  sbApi
};
