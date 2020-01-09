const { spaceId, componentDirectory } = require("./config");
const Logger = require("./helpers/logger");
const { sleep, sleepBlock } = require("./helpers/sleep");
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
      Logger.error("error happened... :(");
      console.log(
        `${err.message} in migration of ${componentName} in migrateComponent`
      );
    });
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
  sleepBlock(250);
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
      Logger.error("error happened... :(");
      console.log(
        `${err.message} in migration of ${component.name} in createComponent function`
      );
    });
};

const updateComponent = component => {
  Logger.log(`Trying to update '${component.name}' with id ${component.id}`);
  sleepBlock(250);
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
      Logger.error("error happened... :(");
      console.log(
        `${err.message} in migration of ${component.name} in updateComponent function`
      );
    });
};

const resolveGroups = async (
  component,
  existedGroups,
  remoteComponentsGroups
) => {
  if (!component.component_group_name) {
    return component;
  }
  const componentsGroup = existedGroups.find(
    group => component.component_group_name === group
  );
  if (componentsGroup) {
    const component_group_uuid = remoteComponentsGroups.component_groups.find(
      remoteComponentsGroup => remoteComponentsGroup.name === componentsGroup
    ).uuid;

    return { ...component, component_group_uuid };
  } else {
    const newComponentsGroup = await createComponentsGroup(
      component.component_group_name
    );
    const component_group_uuid = newComponentsGroup.component_group.uuid;

    return { ...component, component_group_uuid };
  }
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
    if (temp) {
      specifiedComponents = specifiedComponents.filter(
        component => component !== temp
      );
    }

    return temp;
  });

  const filteredComponentsToCreate = componentsToCreate.filter(c => {
    const temp = specifiedComponents.find(component => component === c.name);
    return temp;
  });

  const groupsToCheck = localComponents
    .filter(component => component.component_group_name)
    .map(component => component.component_group_name);
  const uniqueGroupsToCheck = new Set(groupsToCheck);
  const arrayWithUniqueGroupsToCheck = [...uniqueGroupsToCheck];

  const checkGroups = async () => {
    const componentsGroups = await restApi.getAllComponentsGroups();
    const groupExist = groupName =>
      componentsGroups.component_groups.find(group => group.name === groupName);
    for (groupName of arrayWithUniqueGroupsToCheck) {
      if (!groupExist(groupName)) {
        await createComponentsGroup(groupName);
      }
    }
  }

  await checkGroups();

  const componentsGroups = await restApi.getAllComponentsGroups();

  const uberFilteredComponentsToUpdate = filteredComponentsToUpdate.map(
    component =>
      resolveGroups(component, arrayWithUniqueGroupsToCheck, componentsGroups)
  );
  Promise.all(uberFilteredComponentsToUpdate).then(res => {
    Logger.log("Components to update after check: ");
    res.map(component => {
      Logger.warning(`   ${component.name}`);
      updateComponent(component);
    });
  });

  const uberFilteredComponentsToCreate = filteredComponentsToCreate.map(
    component =>
      resolveGroups(component, arrayWithUniqueGroupsToCheck, componentsGroups)
  );
  Promise.all(uberFilteredComponentsToCreate).then(res => {
    Logger.log("Components to create after check: ");
    res.map(component => {
      Logger.warning(`   ${component.name}`);
      createComponent(component);
    });
  });
};

const syncAllComponents = () => {
  const specifiedComponents = components.map(component => component.name);
  syncComponents(specifiedComponents);
};

module.exports = {
  migrateComponent,
  syncAllComponents,
  syncComponents
};