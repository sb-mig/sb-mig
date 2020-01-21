const {
  getComponent,
  getAllComponents,
  getComponentsGroup,
  getAllComponentsGroups,
  createComponentsGroup
} = require("./components")

const { createComponent, updateComponent } = require("./mutateComponents")

const {
  getPreset,
  getAllPresets,
  createPreset,
  updatePreset
} = require("./presets")

const { getComponentPresets } = require("./componentPresets")

  const {
    getAllDatasources,
    getDatasource,
    getDatasourceEntries
  } = require("./datasources")

module.exports = {
  getAllComponentsGroups,
  getComponentsGroup,
  createComponentsGroup,
  getAllComponents,
  getComponent,
  createComponent,
  updateComponent,
  getComponentPresets,
  getAllPresets,
  getPreset,
  createPreset,
  updatePreset,
  getAllDatasources,
  getDatasource,
  getDatasourceEntries
}
