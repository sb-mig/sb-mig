const updateNotifier = require("update-notifier")
const Logger = require("./helpers/logger")
const commander = require("commander")
const package = require("../package.json")
const api = require("./api")
const migrate = require("./migrate")
const { components } = require("./discover")
const {
  sbmigWorkingDirectory,
  schemaFileExt,
  componentsDirectories,
  componentDirectory
} = require("./config")
const configCliValues = require("./config")
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
      .option("-S, --sync-all", "Sync all components from schema with")
      .option(
        "-D, --sync-datasources",
        "Sync provided components from schema with"
      )
      .option(
        "-n, --no-presets",
        "Use with --sync or --sync-all. Sync components without presets"
      )
      .option(
        "-x, --ext",
        "Use only with --sync or --sync-all. By default sync with *.sb.js extension"
      )
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
      .option(
        "-e, --datasource <datasource-name>",
        "Get single datasource by name"
      )
      .option(
        "-f, --datasource-entries <datasource-name>",
        "Get single datasource entries by name"
      )
      .option("-t, --all-datasources", "Get all datasources")
      .option("-d, --debug", "Output extra debugging")

    program.parse(process.argv)

    if (program.syncDatasources) {
      Logger.log("Start synciong datasources...")
      console.log(program.args);
      api.syncDatasources(program.args)
    }

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
        migrate.syncComponents(program.args, program.ext, program.presets)
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
        migrate.syncComponents(program.args, schemaFileExt, program.presets)
      }
    }

    if (program.syncAll && !program.ext) {
      Logger.log(
        `Syncing all components from ${componentDirectory} directory...`
      )
      migrate.syncAllComponents(false, program.presets)
    }

    if (program.syncAll && program.ext) {
      Logger.log(`Syncing all components with ${schemaFileExt} extension...`)
      migrate.syncAllComponents(schemaFileExt, program.presets)
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

    if (program.datasourceEntries) {
      api.getDatasourceEntries(program.datasourceEntries).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `datasource-entries-${program.datasourceEntries}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/datasources/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/datasources/${filename}.json`
          )
          Logger.success(
            `Datasource entries for ${program.datasourceEntries} written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.datasource) {
      api.getDatasource(program.datasource).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `datasource-${program.datasource}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/datasources/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/datasources/${filename}.json`
          )
          Logger.success(
            `Datasource for ${program.datasource} written to a file:  ${filename}`
          )
        }
      })
    }

    if (program.allDatasources) {
      api.getAllDatasources().then(async res => {
        const randomDatestamp = new Date().toJSON()
        const filename = `all-datasources-${randomDatestamp}`
        await createDir(`${sbmigWorkingDirectory}/datasources/`)
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/datasources/${filename}.json`
        )
        Logger.success(`All datasources written to a file:  ${filename}`)
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

    if (program.debug) {
      console.log("Values used by sb-mig: ")
      console.log(configCliValues)
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

module.exports = {
  start
}
