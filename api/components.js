const Fetch = require("node-fetch");
const Logger = require("../helpers/logger");
const { sleepBlock } = require("../helpers/sleep");
const { storyblokApiUrl, spaceId } = require("../config");
const { headers, sbApi } = require("./config");

// GET
const getAllComponents = () => {
  Logger.log("Trying to get all components.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/components/`, {
    headers
  })
    .then(response => response.json())
    .catch(err => Logger.error(err));
};

const getComponent = componentName => {
  Logger.log(`Trying to get '${componentName}' component.`);

  return getAllComponents()
    .then(res =>
      res.components.filter(component => component.name === componentName)
    )
    .then(res => {
      if (Array.isArray(res) && res.length === 0) {
        Logger.warning(`There is no component named '${componentName}'`);
        return false;
      }
      return res;
    })
    .catch(err => Logger.error(err));
};

const getComponentsGroup = groupName => {
  Logger.log(`Trying to get '${groupName}' group.`);

  return getAllComponentsGroups()
    .then(res => {
      return res.component_groups.filter(group => group.name === groupName);
    })
    .then(res => {
      if (Array.isArray(res) && res.length === 0) {
        Logger.warning(`There is no group named '${groupName}'`);
        return false;
      }
      return res;
    })
    .catch(err => Logger.error(err));
};

const getAllComponentsGroups = async () => {
  Logger.log("Trying to get all groups.");

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/component_groups/`, {
    headers
  })
    .then(response => response.json())
    .catch(err => Logger.error(err));
};

const createComponentsGroup = groupName => {
  Logger.log(`Trying to create '${groupName}' group`);
  sleepBlock(250);
  return sbApi
    .post(`spaces/${spaceId}/component_groups/`, {
      component_group: {
        name: groupName
      }
    })
    .then(res => {
      Logger.warning(
        `'${groupName}' created with uuid: ${res.data.component_group.uuid}`
      );
      return res.data;
    })
    .catch(err => {
      Logger.error(`Error happened :()`);
      console.log(err.message);
    });
};



module.exports = {
  getComponent,
  getAllComponents,
  getComponentsGroup,
  getAllComponentsGroups,
  createComponentsGroup,
};
