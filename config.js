require("dotenv").config();

const defaultConfig = {
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
  spaceId: process.env.STORYBLOK_SPACE_ID,
  accessToken: process.env.STORYBLOK_ACCESS_TOKEN,
  githubToken: process.env.GITHUB_TOKEN,
  seedRepo: process.env.SEED_REPO
};

const storyblokApiUrl = 'https://api.storyblok.com/v1';

module.exports = { ...defaultConfig, storyblokApiUrl };
