const { spaceId, componentDirectory } = require("./config")
const Logger = require("./helpers/logger")
const { components, findComponentsWithExt } = require("./discover")
const api = require("./api")

const _uniqueValuesFrom = array => [...new Set(array)]

const _checkAndPrepareGroups = async groupsToCheck => {
  const componentsGroups = await api.getAllComponentsGroups()
  const groupExist = groupName =>
    componentsGroups.component_groups.find(group => group.name === groupName)
  for (groupName of groupsToCheck) {
    if (!groupExist(groupName)) {
      await api.createComponentsGroup(groupName)
    }
  }
}

const _resolveGroups = async (
  component,
  existedGroups,
  remoteComponentsGroups
) => {
  if (!component.component_group_name) {
    return { ...component, component_group_uuid: null }
  }
  const componentsGroup = existedGroups.find(
    group => component.component_group_name === group
  )
  if (componentsGroup) {
    const component_group_uuid = remoteComponentsGroups.component_groups.find(
      remoteComponentsGroup => remoteComponentsGroup.name === componentsGroup
    ).uuid

    return { ...component, component_group_uuid }
  }
}

const syncComponents = async (specifiedComponents, ext) => {
  Logger.log(`Trying to sync all components from '${componentDirectory}'`)
  let localComponents
  if (ext) {
    localComponents = findComponentsWithExt(ext)
  } else {
    localComponents = components
  }

  const groupsToCheck = _uniqueValuesFrom(
    localComponents
      .filter(component => component.component_group_name)
      .map(component => component.component_group_name)
  )

  await _checkAndPrepareGroups(groupsToCheck)

  // after checkAndPrepareGroups remoteComponents will have synced groups with local groups
  // updates of the groups had to happen before creation of them, cause creation/updates of components
  // happens async, so if one component will have the same group, as other one
  // it will be race of condition kinda issue - we will never now, if the group for current processed component
  // already exist or is being created by other request
  const remoteComponents = await api.getAllComponents()

  let componentsToUpdate = []
  let componentsToCreate = []

  for (const component of localComponents) {
    const shouldBeUpdated = remoteComponents.components.find(
      remoteComponent => component.name === remoteComponent.name
    )
    if (shouldBeUpdated) {
      componentsToUpdate.push({ id: shouldBeUpdated.id, ...component })
    } else {
      componentsToCreate.push(component)
    }
  }

  const componentsGroups = await api.getAllComponentsGroups()

  Promise.all(
    componentsToUpdate
      .filter(c => {
        const temp = specifiedComponents.find(component => component === c.name)
        if (temp) {
          specifiedComponents = specifiedComponents.filter(
            component => component !== temp
          )
        }

        return temp
      })
      .map(component =>
        _resolveGroups(component, groupsToCheck, componentsGroups)
      )
  ).then(res => {
    Logger.log("Components to update after check: ")
    res.map(component => {
      Logger.warning(`   ${component.name}`)
      api.updateComponent(component)
    })
  })

  Promise.all(
    componentsToCreate
      .filter(c => {
        const temp = specifiedComponents.find(component => component === c.name)
        return temp
      })
      .map(component =>
        _resolveGroups(component, groupsToCheck, componentsGroups)
      )
  ).then(res => {
    Logger.log("Components to create after check: ")
    res.map(component => {
      Logger.warning(`   ${component.name}`)
      api.createComponent(component)
    })
  })
}

const syncAllComponents = () => {
  const specifiedComponents = components.map(component => component.name)
  syncComponents(specifiedComponents)
}

module.exports = {
  syncAllComponents,
  syncComponents
}
