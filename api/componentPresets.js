const Logger = require("../helpers/logger")
const { getAllComponents } = require("./components")
const { getPreset } = require("./presets")

const getComponentPresets = componentName => {
  Logger.log(`Trying to get all '${componentName}' presets.`)

  return getAllComponents().then(async res => {
    const componentPresets = res.components.filter(
      component => component.name === componentName
    )

    if (componentPresets.length > 0) {
      if (componentPresets[0].all_presets.length === 0) {
        Logger.warning(`There is no presets for: '${componentName}' component`)
        return false
      } else {
        return Promise.all(
          componentPresets[0].all_presets.map(preset =>
            getPreset(preset.id).catch(err => Logger.error(err))
          )
        )
      }
    } else {
      Logger.warning(`There is no '${componentName}' component`)
      return false
    }
  })
}

module.exports = {
  getComponentPresets
}
