const updateNotifier = require("update-notifier")
const Logger = require("./helpers/logger")
const commander = require("commander")
const package = require("../package.json")
const api = require("./api")
const migrate = require("./migrate")
const {
  sbmigWorkingDirectory,
  schemaFileExt,
  componentsDirectories,
  componentDirectory
} = require("./config")
const { createDir, createJsonFile } = require("./helpers/files")

const program = new commander.Command()

async function start() {
  Logger.bigLog("sb-mig")
  try {
    const notifier = updateNotifier({
      pkg: package,
      updateCheckInterval: 1000,
      shouldNotifyInNpmScript: true
    })
    notifier.notify()
    program.version(package.version)

    program
      .option("-s, --sync", "Sync provided components from schema with")
      .option(
        "-x, --ext",
        "Use only with --sync or --sync-all. By default sync with *.sb.js extension"
      )
      .option("-S, --sync-all", "Sync all components from schema with")
      .option("-g, --all-components-groups", "Get all component groups")
      .option(
        "-c, --components-group <components-group-name>",
        "Get single components group by name"
      )
      .option("-a, --all-components", "Get all components")
      .option(
        "-c, --component <component-name>",
        "Get single component by name"
      )
      .option("-q, --all-presets", "Get all presets")
      .option("-p, --preset <preset-id>", "Get preset by id")
      .option(
        "-d, --component-presets <component-name>",
        "Get all presets for single component by name"
      )
      .option("-d, --debug", "Output extra debugging")

    program.parse(process.argv)

    if (program.ext && !program.sync && !program.syncAll) {
      Logger.warning(
        `Use only with --sync or --sync-all option: sb-mig --sync --ext ${program.args.join(
          " "
        )}`
      )
    }

    if (program.sync && !program.ext) {
      Logger.log("Syncing provided components...")

      if (program.args.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        migrate.syncComponents(program.args)
      }
    }

    if (program.sync && program.ext) {
      Logger.log(
        `Syncing provided components with ${schemaFileExt} extension, inside [${componentsDirectories.join(
          ", "
        )}] directories ...`
      )

      if (program.args.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        migrate.syncComponents(program.args, schemaFileExt)
      }
    }

    if (program.syncAll && !program.ext) {
      Logger.log(
        `Syncing all components from ${componentDirectory} directory...`
      )
      migrate.syncAllComponents()
    }

    if (program.syncAll && program.ext) {
      Logger.log(`Syncing all components with ${schemaFileExt} extension...`)
      migrate.syncAllComponents(schemaFileExt)
    }

    if (program.preset) {
      api.getPreset(program.preset).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `preset-${program.preset}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/presets/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/presets/${filename}.json`
          )
          Logger.success(
            `Preset for '${program.preset}' have been written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.allPresets) {
      api.getAllPresets().then(async res => {
        const randomDatestamp = new Date().toJSON()
        const filename = `all-presets-${randomDatestamp}`
        await createDir(`${sbmigWorkingDirectory}/presets/`)
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/presets/${filename}.json`
        )
        Logger.success(`All presets written to a file:  ${filename}`)
      })
    }

    if (program.componentPresets) {
      api.getComponentPresets(program.componentPresets).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `component-${program.componentPresets}-all_presets-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/component-presets/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/component-presets/${filename}.json`
          )
          Logger.success(
            `Presets for ${program.componentPresets} written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.allComponentsGroups) {
      api.getAllComponentsGroups().then(async res => {
        const randomDatestamp = new Date().toJSON()
        const filename = `all-component_groups-${randomDatestamp}`
        await createDir(`${sbmigWorkingDirectory}/component_groups/`)
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/component_groups/${filename}.json`
        )
        Logger.success(`All groups written to a file:  ${filename}`)
      })
    }

    if (program.componentsGroup) {
      api.getComponentsGroup(program.componentsGroup).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `components_group-${program.componentsGroup}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/component_groups/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/component_groups/${filename}.json`
          )
          Logger.success(
            `Components group for ${program.componentsGroup} written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.component) {
      api.getComponent(program.component).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `component-${program.component}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/components/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/components/${filename}.json`
          )
          Logger.success(
            `Component for ${program.component} written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.allComponents) {
      api.getAllComponents().then(async res => {
        const randomDatestamp = new Date().toJSON()
        const filename = `all-components-${randomDatestamp}`
        await createDir(`${sbmigWorkingDirectory}/components/`)
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/components/${filename}.json`
        )
        Logger.success(`All components written to a file:  ${filename}`)
      })
    }

    if (program.debug) console.log(program.opts())
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

module.exports = {
  start
}
