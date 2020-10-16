import { flags } from '@oclif/command'
import Command from '../core'
import storyblokConfig from "../config/config"
import Logger from "../utils/logger"
import { syncAllComponents, syncComponents, syncAllLockComponents } from '../api/migrate'

export default class Sync extends Command {
  static description = 'Synchronize components, datasources with Storyblok space.'

  static examples = [
    `$ sb-mig sync components --lock`,
    `$ sb-mig sync components @storyblok-components/text-block --ext --packageName`,
    `$ sb-mig sync components @storyblok-components/text-block @storyblok-components/button --ext --packageName`,
    `$ sb-mig sync components --all --ext`,
    `$ sb-mig sync components text-block button --ext`,
    `$ sb-mig sync components text-block button`,
  ]

  static flags = {
    help: flags.help({ char: 'h' }),
    all: flags.boolean({ char: 'a', description: "Synchronize all components." }),
    ext: flags.boolean({ char: 'e', description: "Synchronize with file extension. Default extension: '.sb.js'" }),
    packageName: flags.boolean({ char: 'n', description: "Synchronize based on installed package name." }),
    presets: flags.boolean({ char: 'p', description: "Synchronize components with presets." }),
    lock: flags.boolean({char: 'l', description: "Synchronize based on storyblok.components.lock.js file"})
  }

  static strict = false;

  static args = [
    { name: 'type', description: "What to synchronize", options: ['components', 'datasources'], required: true },
    { name: "list", description: "Space separated list of component names. Example: card product-card row layout" }
  ]

  async run() {
    const { argv, args, flags } = this.parse(Sync)
    const components = argv.splice(1, argv.length);

    if(args.type === "components" && flags.lock) {
      Logger.log(`Syncing components base on storyblok.components.lock.js file...`)
      syncAllLockComponents(storyblokConfig.schemaFileExt, !!flags.presets, this.storyblokComponentsConfig())
    }

    if (args.type === "components" && flags.all && flags.ext) {
      Logger.log(`Syncing all components with ${storyblokConfig.schemaFileExt} extension...`)
      syncAllComponents(storyblokConfig.schemaFileExt, !!flags.presets)
    }

    if (args.type === "components" && flags.all && !flags.ext) {
      Logger.log(
        `Syncing all components from ${storyblokConfig.componentDirectory} directory...`
      )

      syncAllComponents(!!flags.ext, !!flags.presets)
    }

    if (args.type === "components" && !flags.all && flags.ext) {
      Logger.log(
        `Syncing provided components with ${storyblokConfig.schemaFileExt} extension, inside [${storyblokConfig.componentsDirectories.join(
          ", "
        )}] directories ...`
      )

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        syncComponents(components, storyblokConfig.schemaFileExt, !!flags.presets, flags.packageName)
      }
    }

    if (args.type === "components" && !flags.all && !flags.ext && !flags.lock) {
      Logger.log("Syncing provided components...")

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        syncComponents(components, !!flags.ext, !!flags.presets, flags.packageName)
      }
    }

    if (args.type === "datasources") {
      // TODO: implement syncing datasources
      this.error("There is no implementation for synchronizing datasources, yet.")
    }
  }
}
