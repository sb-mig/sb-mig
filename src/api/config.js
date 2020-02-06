const StoryblokClient = require("storyblok-js-client")
const {
  oauthToken,
  githubToken,
  accessToken,
  storyblokApiUrl
} = require("../config")

const headers = {
  "Content-Type": "application/json",
  Authorization: oauthToken
}

const githubHeaders = {
  ...headers,
  Authorization: `token ${githubToken}`
}

const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl)

module.exports = {
  headers,
  githubHeaders,
  sbApi
}
