const Logger = require("../helpers/logger")
const { sleepBlock } = require("../helpers/sleep")
const { spaceId } = require("../config")
const { sbApi } = require("./config")
const _resolvePresets = require("./resolvePresets")

// UPDATE
const updateComponent = (component, presets) => {
  Logger.log(`Trying to update '${component.name}' with id ${component.id}`)
  sleepBlock(250)
  const componentWithPresets = component
  const { all_presets, ...componentWithoutPresets } = componentWithPresets

  sbApi
    .put(`spaces/${spaceId}/components/${component.id}`, {
      component: componentWithoutPresets
    })
    .then(res => {
      Logger.success(`Component '${component.name}' has been updated.`)
      if (presets) {
        _resolvePresets(res, all_presets, component)
      }
    })
    .catch(err => {
      Logger.error("error happened... :(")
      console.log(
        `${err.message} in migration of ${component.name} in updateComponent function`
      )
    })
}

// CREATE
const createComponent = (component, presets) => {
  Logger.log(`Trying to create '${component.name}'`)
  sleepBlock(250)
  const componentWithPresets = component
  const { all_presets, ...componentWithoutPresets } = componentWithPresets

  sbApi
    .post(`spaces/${spaceId}/components/`, {
      component: componentWithoutPresets
    })
    .then(res => {
      Logger.success(`Component '${component.name}' has been created.`)
      if (presets) {
        _resolvePresets(res, all_presets, component)
      }
    })
    .catch(err => {
      Logger.error("error happened... :(")
      console.log(
        `${err.message} in migration of ${component.name} in createComponent function`
      )
    })
}

module.exports = {
  updateComponent,
  createComponent
}
