const updateNotifier = require("update-notifier")
const execa = require("execa")
const fs = require("fs")
const Logger = require("./helpers/logger")
const commander = require("commander")
const package = require("../package.json")
const api = require("./api")
const os = require("os")
const migrate = require("./migrate")
const { sbApi } = require("./api/config")
const { generateComponentsFile } = require("./helpers/componentsFileGenerator")
const { components } = require("./discover")
const ora = require("ora")
const rimraf = require("rimraf")
const {
  boilerplateUrl,
  sbmigWorkingDirectory,
  schemaFileExt,
  componentsDirectories,
  componentDirectory,
  reactComponentsDirectory,
  npmScopeForComponents
} = require("./config")
const configValues = require("./config")

const {
  createDir,
  createJsonFile,
  copyFile,
  copyFolder
} = require("./helpers/files")

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
      .option("-s, --sync", "Sync provided components from schema")
      .option("-S, --sync-all", "Sync all components from schema")
      .option("-D, --sync-datasources", "Sync provided datasources from schema")
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
        "-C, --components-group <components-group-name>",
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
        "-f, --datasource-entry <datasource-name>",
        "Get single datasource entries by name"
      )
      .option("-t, --all-datasources", "Get all datasources")
      .option("-G, --generate", "Generate project")
      .option("-A, --add", "Add components.")
      .option("-d, --debug", "Output extra debugging")

    program.parse(process.argv)

    if (program.syncDatasources) {
      Logger.log(`Syncing priovided datasources ${program.args}...`)
      api.syncDatasources(program.args)
    }

    if (program.syncDatasources) {
      Logger.log(`Syncing priovided datasources ${program.args}...`)
      api.syncDatasources(program.args)
    }

    if (program.add && !program.generate) {
      console.log(program.args)
      let spinner = ora(`Installing components...`).start()

      Promise.allSettled(
        program.args.map(component => {
          return execa.command(
            `npm install ${npmScopeForComponents}/${component} --save`
          )
        })
      )
        .then(res => {
          res.map(singleRes => {
            spinner.stop()
            if (singleRes.status === 'fulfilled') {
              Logger.success(`${singleRes.value.command} end successful!`)
            }
            if (singleRes.status === 'rejected') {
              Logger.error(`${singleRes.value.command} rejected :( !`)
              console.log(singleRes.value.stdout);
            }
          })
          spinner = ora(`Copying folders...`).start()

          Promise.allSettled(
            program.args.map(component => {
              const componentName = component.split("@")[0]

              return copyFolder(
                `./node_modules/${npmScopeForComponents}/${componentName}/src/`,
                `./${reactComponentsDirectory}/scoped/`
              )
            })
          ).then(response => {
            response.map(singleResponse => {
              spinner.stop()
              if (singleResponse.status === 'fulfilled') {
                Logger.success(singleResponse.value.message)
              }
              if (singleResponse.status === 'rejected') {
                Logger.error(singleResponse.value.message)
                console.log(singleResponse);
              }
            })
          }).catch(error => {
            Logger.error("error happened when copying folders... :(")
            console.log(error);
          })
        })
        .catch(err => {
          Logger.error("error happened when installing scoped components... :(")
          console.log(err)
        })
    }

    if (program.generate) {
      Logger.warning(`Starting generating project...`)
      ;(async () => {
        if (program.args.length > 0) {
          Logger.log(`Creating start project...`)
          Logger.log(`Using ${boilerplateUrl} boilerplate...`)
          const data = await execa.command(
            `git clone ${boilerplateUrl} storyblok-boilerplate`,
            {
              shell: true
            }
          )
          if (data.failed) {
            return false
          }
          const {
            data: { space }
          } = await api.createSpace(program.args[0])
          Logger.success(`Space ${program.args[0]} has been created.`)
          rimraf.sync(`./storyblok-boilerplate/.git`)
          rimraf.sync(`./storyblok-boilerplate/storyblok.config.js`)
          rimraf.sync(`./storyblok-boilerplate/.npmrc`)
          rimraf.sync(`./storyblok-boilerplate/src/components/components.js`)
          fs.appendFile(
            "./.env",
            `\nSTORYBLOK_SPACE_ID=${space.id}\nGATSBY_STORYBLOK_ACCESS_TOKEN=${space.first_token}`,
            err => {
              if (err) {
                return Logger.error(err)
              }
              Logger.success(`.env file has been updated`)
            }
          )
          if (os.type() === "Windows_NT") {
            execa.commandSync(`move ./storyblok-boilerplate/* ./`, {
              shell: true
            })
          } else {
            execa.commandSync(`mv ./storyblok-boilerplate/* ./`, {
              shell: true
            })
            execa.commandSync(`mv ./storyblok-boilerplate/.[!.]* ./`, {
              shell: true
            })
          }

          rimraf.sync(`storyblok-boilerplate`)
          if (program.add) {
            const filteredArgs = program.args.slice(1, program.args.length)
            filteredArgs.map(async component => {
              execa.commandSync(
                `npm install ${npmScopeForComponents}/${component} --save`
              )
            })
          }
          Logger.log(`Installing dependencies...`)
          await execa.command(`npm install`)
          Logger.success(`Dependenciess installed.`)
          Logger.log(
            `Starting copying components and schemas from node_modules...`
          )
          if (program.add) {
            const filteredArgs = program.args.slice(1, program.args.length)
            filteredArgs.map(async component => {
              // copy .sb.js ext schema file
              await copyFile(
                `./node_modules/${npmScopeForComponents}/${component}/${component}.sb.js`,
                `./${reactComponentsDirectory}/scoped/${component}.sb.js`
              )

              // copy react component
              await copyFile(
                `./node_modules/${npmScopeForComponents}/${component}/src/${component}.js`,
                `./${reactComponentsDirectory}/scoped/${component}.js`
              )
            })
            await createJsonFile(
              generateComponentsFile(filteredArgs),
              `./src/components/components.js`
            )
          }
          // here is publishing changes to easy run npm start or working gatsby + storyblok
          const {
            data: { stories }
          } = await sbApi.get(`spaces/${space.id}/stories/`)
          await sbApi.get(`spaces/${space.id}/stories/${stories[0].id}/publish`)
          Logger.log(
            `Run sb-mig --sync-all --ext to synchronize all storyblok components. Then: npm start. Go to http://app.storyblok.com/#!/me/spaces/${space.id}/ and enjoy.`
          )
        } else {
          Logger.warning(`Provide name of the space to be created`)
        }
      })()
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

    if (program.datasourceEntry) {
      api.getDatasourceEntries(program.datasourceEntry).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `datasource-entries-${program.datasourceEntry}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/datasources/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/datasources/${filename}.json`
          )
          Logger.success(
            `Datasource entries for ${program.datasourceEntry} written to a file:  ${filename}`
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
      Logger.log("Values used by sb-mig: ")
      Logger.log(configValues)
    }
  } catch (err) {
    Logger.error(err)
    process.exit(1)
  }
}

module.exports = {
  start
}
