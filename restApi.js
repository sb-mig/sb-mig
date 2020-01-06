const Fetch = require("node-fetch");
const Logger = require('./helpers/logger');
const { oauthToken, storyblokApiUrl, spaceId } = require("./config");

const headers = {
  "Content-Type": "application/json",
  Authorization: oauthToken
};

const getAllComponents = () => {
  Logger.log("Trying to get all components.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/components/`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

const getComponent = componentName => {
  Logger.log(`Trying to get '${componentName}' component.`);

  return getAllComponents().then(res =>
    res.components.filter(component => component.name === componentName)
  );
};

const getComponentPresets = componentName => {
  Logger.log(`Trying to get all '${componentName}' presets.`);

  return getAllComponents().then(async res => {
    const filteredArray = res.components.filter(
      component => component.name === componentName
    );

    if (filteredArray.length > 0) {
      if (filteredArray[0].all_presets.length === 0) {
        Logger.warning(`There is no presets for: '${componentName}' component`);
      } else {
        return Promise.all(
          filteredArray[0].all_presets.map(preset =>
            getPreset(preset.id).then(res => res)
          )
        ).then(res => res);
      }
    } else {
      Logger.warning(`There is no '${componentName}' component`);
      return false;
    }
  });
};

const getAllPresets = () => {
  Logger.log("Trying to get all Presets.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/presets/`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

const getPreset = presetId => {
  Logger.log(`Trying to get preset by id: ${presetId}`);

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/presets/${presetId}`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

module.exports = {
  getAllComponents,
  getComponent,
  getComponentPresets,
  getAllPresets,
  getPreset
};
