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
}
