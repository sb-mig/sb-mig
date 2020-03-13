const Logger = require("../helpers/logger")
const { updatePreset, createPreset } = require("./presets")
const { getComponentPresets } = require("./componentPresets")

const _resolvePresets = async (res, all_presets, component) => {
  const componentId = res.data.component.id

  if (all_presets && all_presets.length > 0) {
    const all_presets_modified = all_presets.map(p => {
      return { preset: { ...p.preset, component_id: componentId } }
    })
    Logger.log(`Checking preset for '${component.name}' component`)

    const allRemoteComponentPresets = await getComponentPresets(component.name)

    let presetsToUpdate = []
    let presetsToCreate = []

    for (const componentPreset of all_presets_modified) {
      const shouldBeUpdated =
        allRemoteComponentPresets &&
        allRemoteComponentPresets.find(
          remotePreset =>
            componentPreset.preset.name === remotePreset.preset.name
        )
      if (shouldBeUpdated) {
        presetsToUpdate.push({
          ...componentPreset,
          preset: { id: shouldBeUpdated.preset.id, ...componentPreset.preset }
        })
      } else {
        presetsToCreate.push(componentPreset)
      }
    }

    presetsToUpdate.map(preset => {
      updatePreset(preset)
    })

    presetsToCreate.map(preset => {
      createPreset(preset)
    })
  } else {
    Logger.warning("There are no presets for this component.")
  }
}

module.exports = _resolvePresets
