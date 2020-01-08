const { spaceId, componentDirectory } = require("./config");
const Logger = require("./helpers/logger");
const { componentByName, components } = require("./discover");
const restApi = require("./restApi");
const sbApi = require("./sbApi");

const migrateComponent = componentName => {
  Logger.warning(`Trying to find '${componentName}' by name`);
  const component = componentByName(componentName);

  if (!component) {
    Logger.error(`'${componentName}' is not available to be migrated`);
    return false;
  }

  Logger.log(`Trying to migrate '${componentName}'`);

  const componentWithPresets = component;

  const { all_presets, ...componentWithoutPresets } = componentWithPresets;

  sbApi
    .post(`spaces/${spaceId}/components/`, {
      component: componentWithoutPresets
    })
    .then(res => {
      Logger.success(`Component '${componentName}' has been created.`);
      const componentId = res.data.component.id;

      if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map(p => {
          return { preset: { ...p.preset, component_id: componentId } };
        });
        Logger.error(
          `Trying to create presets for '${componentName}' component`
        );
        all_presets_modified.map(p => {
          if (p.preset.id) {
            updatePreset(p);
          } else {
            createPreset(p);
          }
        });
      } else {
        Logger.error("There are no presets for this component.");
      }
    })
    .catch(err => {
      console.log("error happened... :(");
      console.log(err.message);
    });
};

const createPreset = p => {
  sbApi
    .post(`spaces/${spaceId}/presets/`, {
      preset: p.preset
    })
    .then(res => {
      Logger.warning(`Preset: '${p.preset.name}' has been created.`);
    })
    .catch(err => {
      Logger.error(
        `Error happened. Preset: '${p.preset.name}' has been not created.`
      );
      console.log(err.message);
    });
};

const updatePreset = p => {
  sbApi
    .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
      preset: p.preset
    })
    .then(res => {
      Logger.warning(
        `Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`
      );
    })
    .catch(err => {
      Logger.error(
        `Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`
      );
      console.log(err.message);
    });
};

const createComponent = component => {
  Logger.log(`Trying to create '${component.name}'`);
  const componentWithPresets = component;
  const { all_presets, ...componentWithoutPresets } = componentWithPresets;

  sbApi
    .post(`spaces/${spaceId}/components/`, {
      component: componentWithoutPresets
    })
    .then(res => {
      Logger.success(`Component '${component.name}' has been created.`);
      const componentId = res.data.component.id;

      if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map(p => {
          return { preset: { ...p.preset, component_id: componentId } };
        });
        Logger.error(
          `Trying to create presets for '${component.name}' component`
        );
        all_presets_modified.map(p => {
          if (p.preset.id) {
            updatePreset(p);
          } else {
            createPreset(p);
          }
        });
      } else {
        Logger.error("There are no presets for this component.");
      }
    })
    .catch(err => {
      console.log("error happened... :(");
      console.log(err.message);
    });
};

const updateComponent = component => {
  Logger.log(`Trying to update '${component.name}' with id ${component.id}`);
  const componentWithPresets = component;
  const { all_presets, ...componentWithoutPresets } = componentWithPresets;

  sbApi
    .put(`spaces/${spaceId}/components/${component.id}`, {
      component: componentWithoutPresets
    })
    .then(res => {
      Logger.success(`Component '${component.name}' has been updated.`);
      const componentId = res.data.component.id;

      if (all_presets && all_presets.length > 0) {
        const all_presets_modified = all_presets.map(p => {
          return { preset: { ...p.preset, component_id: componentId } };
        });
        Logger.error(
          `Trying to create presets for '${component.name}' component`
        );
        all_presets_modified.map(p => {
          if (p.preset.id) {
            updatePreset(p);
          } else {
            createPreset(p);
          }
        });
      } else {
        Logger.error("There are no presets for this component.");
      }
    })
    .catch(err => {
      console.log("error happened... :(");
      console.log(err.message);
    });
};

const syncAllComponents = async () => {
  Logger.log(`Trying to sync all components from '${componentDirectory}'`);
  const localComponents = components;
  const remoteComponents = await restApi.getAllComponents();

  let componentsToUpdate = [];
  let componentsToCreate = [];

  for (const component of localComponents) {
    const shouldBeUpdated = remoteComponents.components.find(
      remoteComponent => component.name === remoteComponent.name
    );
    if (shouldBeUpdated) {
      componentsToUpdate.push({ id: shouldBeUpdated.id, ...component });
    } else {
      componentsToCreate.push(component);
    }
  }

  componentsToCreate.map(component => {
    createComponent(component);
  });

  componentsToUpdate.map(component => {
    updateComponent(component);
  });
};

const syncComponents = async specifiedComponents => {
  Logger.log(`Trying to sync all components from '${componentDirectory}'`);
  const localComponents = components;
  const remoteComponents = await restApi.getAllComponents();

  let componentsToUpdate = [];
  let componentsToCreate = [];

  for (const component of localComponents) {
    const shouldBeUpdated = remoteComponents.components.find(
      remoteComponent => component.name === remoteComponent.name
    );
    if (shouldBeUpdated) {
      componentsToUpdate.push({ id: shouldBeUpdated.id, ...component });
    } else {
      componentsToCreate.push(component);
    }
  }

  const filteredComponentsToUpdate = componentsToUpdate.filter(c => {
    const temp = specifiedComponents.find(component => component === c.name);
    if(temp) {
      specifiedComponents = specifiedComponents.filter(component => component !== temp)
    }

    return temp
  });
  
  const filteredComponentsToCreate = componentsToCreate.filter(c => {
    const temp = specifiedComponents.find(component => component === c.name);
    return temp
  });

  Logger.log("Components to update after check: ")
  filteredComponentsToUpdate.forEach(component => {
    Logger.warning(`   ${component.name}`);
  })

  Logger.log("Components to create after check: ");
  filteredComponentsToCreate.forEach(component => {
    Logger.warning(`   ${component.name}`);
  })

  filteredComponentsToCreate.map(component => {
    createComponent(component);
  });

  filteredComponentsToUpdate.map(component => {
    updateComponent(component);
  });
};

module.exports = {
  migrateComponent,
  syncAllComponents,
  syncComponents
};
