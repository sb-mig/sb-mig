require("dotenv").config();

const defaultConfig = {
  presetsDirectory: "presets",
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
  spaceId: process.env.STORYBLOK_SPACE_ID,
  accessToken: process.env.STORYBLOK_ACCESS_TOKEN
};

const storyblokApiUrl = 'https://api.storyblok.com/v1';

module.exports = { ...defaultConfig, storyblokApiUrl };
