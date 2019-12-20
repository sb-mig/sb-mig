require("dotenv").config();

const defaultConfig = {
  presetsDirectory: "presets",
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
  spaceId: process.env.STORYBLOK_SPACE_ID
};

module.exports = { ...defaultConfig };
