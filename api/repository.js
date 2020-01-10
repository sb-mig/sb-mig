const Fetch = require("node-fetch");
const Logger = require("../helpers/logger");
const { seedRepo } = require("../config");
const { githubHeaders: headers } = require("./config");

// GET
const getStoryblokComponent = componentName => {
  Logger.error("This is very experimental feature!");
  Logger.warning(
    `Trying to get '${componentName}' storyblok schema from boilerplate.`
  );
  return Fetch(`${seedRepo}/storyblok/${componentName}.js`, {
    headers
  })
    .then(response => {
      if (response.status === 404) {
        Logger.error(`There is no file for '${componentName}' filename`);
        return false;
      }
      return response;
    })
    .catch(err => Logger.error(err.message));
};

const getReactComponent = componentName => {
  Logger.error("This is very experimental feature!");
  Logger.warning(
    `Trying to get '${componentName}' storyblok schema react match from boilerplate.`
  );
  return Fetch(`${seedRepo}/src/components/web-ui/${componentName}.js`, {
    headers
  })
    .then(response => {
      if (response.status === 404) {
        Logger.error(`There is no file for '${componentName}' filename`);
        return false;
      }
      return response;
    })
    .catch(err => Logger.error(err.message));
};

module.exports = {
  getReactComponent,
  getStoryblokComponent
};
