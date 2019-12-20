const Fetch = require("node-fetch");
const { oauthToken, storyblokApiUrl, spaceId } = require("./config");

const headers = {
  "Content-Type": "application/json",
  Authorization: oauthToken
};

const getAllPresets = () => {
  console.log("Making request with rest api (using node-fetch)");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/presets/`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

module.exports = {
  getAllPresets
};
