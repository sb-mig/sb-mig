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

const {
  createSpace,
  getSpace
} = require("./spaces")

const { getComponentPresets } = require("./componentPresets")

  const {
    getAllDatasources,
    getDatasource,
    getDatasourceEntries,
    syncDatasources
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
  getDatasourceEntries,
  syncDatasources,
  createSpace,
  getSpace
}
