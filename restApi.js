const Fetch = require("node-fetch");
const { oauthToken, storyblokApiUrl, spaceId } = require("./config");

const headers = {
  "Content-Type": "application/json",
  Authorization: oauthToken
};

const getAllComponents = () => {
  console.warn("Getting all components.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/components/`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

const getComponent = componentName => {
  console.warn(`Getting ${componentName} component.`);

  return getAllComponents().then(res =>
    res.components.filter(component => component.name === componentName)
  );
};

const getComponentPresets = componentName => {
  console.warn(`Getting all ${componentName} presets.`);

  return getAllComponents().then(async res => {
    const filteredArray = res.components.filter(
      component => component.name === componentName
    );

    return Promise.all(
      filteredArray[0].all_presets.map(preset =>
        getPreset(preset.id).then(res => res)
      )
    ).then(res => res);
  });
};

const getAllPresets = () => {
  console.warn("Getting all Presets.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/presets/`, {
    method: "GET",
    headers: headers
  }).then(response => response.json());
};

const getPreset = presetId => {
  console.warn(`Getting preset by id: ${presetId}`);

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
