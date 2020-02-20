const Logger = require("../helpers/logger")
const { spaceId } = require("../config")
const { sbApi } = require("./config")

// GET
const getPreset = presetId => {
  Logger.log(`Trying to get preset by id: ${presetId}`)

  return sbApi
    .get(`spaces/${spaceId}/presets/${presetId}`)
    .then(response => response.data)
    .then(response => {
      if (Array.isArray(response.presets)) {
        Logger.warning(`There is no preset for '${presetId}' preset id`)
        return false
      }

      return response
    })
    .catch(err => Logger.error(err))
}

const getAllPresets = () => {
  Logger.log("Trying to get all Presets.")

  return sbApi
    .get(`spaces/${spaceId}/presets/`)
    .then(response => response.data)
    .catch(err => Logger.error(err))
}

// CREATE
const createPreset = p => {
  sbApi
    .post(`spaces/${spaceId}/presets/`, {
      preset: p.preset
    })
    .then(res => {
      Logger.warning(`Preset: '${p.preset.name}' has been created.`)
    })
    .catch(err => {
      Logger.error(
        `Error happened. Preset: '${p.preset.name}' has been not created.`
      )
      console.log(err.message)
    })
}

// UPDATE
const updatePreset = p => {
  sbApi
    .put(`spaces/${spaceId}/presets/${p.preset.id}`, {
      preset: p.preset
    })
    .then(res => {
      Logger.warning(
        `Preset: '${p.preset.name}' with '${p.preset.id}' id has been updated.`
      )
    })
    .catch(err => {
      Logger.error(
        `Error happened. Preset: '${p.preset.name}' with '${p.preset.id}' id has been not updated.`
      )
      console.log(err.message)
    })
}

module.exports = {
  getPreset,
  getAllPresets,
  createPreset,
  updatePreset
}
