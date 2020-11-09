import { flags } from '@oclif/command'
import Command from '../core'
import storyblokConfig from "../config/config"
import Logger from "../utils/logger"
import { sync2AllComponents, syncAllComponents, syncComponents, syncProvidedComponents } from '../api/migrate'
import { syncProvidedDatasources, syncAllDatasources } from '../api/datasources'
import { syncAllRoles, syncProvidedRoles} from '../api/roles'

export default class Sync extends Command {
  static description = 'Synchronize components, datasources or roles with Storyblok space.'

  static examples = [
    `$ sb-mig sync components --all --ext`,
    `$ sb-mig sync components @storyblok-components/text-block --ext --packageName`,
    `$ sb-mig sync components @storyblok-components/text-block @storyblok-components/button --ext --packageName`,
    `$ sb-mig sync components text-block button --ext`,
    `$ sb-mig sync components text-block button`,
    `$ sb-mig sync roles`,
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
    { name: 'type', description: "What to synchronize", options: ['components', 'datasources', 'roles'], required: true },
    { name: "list", description: "Space separated list of component names. Example: card product-card row layout" }
  ]

  async run() {
    const { argv, args, flags } = this.parse(Sync)
    const components = argv.splice(1, argv.length);

    if (args.type === "roles" && flags.all && flags.ext) {
      Logger.log("Syncing all roles...")

      syncAllRoles()
    }

    if (args.type === "roles" && !flags.all && flags.ext) {
      const roles = components
      Logger.log("Syncing provided roles...")

      syncProvidedRoles({roles})
    }

    if (args.type === "components" && flags.all && flags.ext) {
        Logger.log(
          `Syncing all components with ${storyblokConfig.schemaFileExt} extension...`
      );

      sync2AllComponents({ presets: flags.presets })
    }

    if (args.type === "components" && flags.all && !flags.ext) {
      Logger.warning("### DEPRECATED method. Method of syncing files without .sb.js extension, will be removed in version 4.0.0 ###")
      Logger.warning("Use sb-mig sync components --all --ext instead (you need to update your schema files to be named with .sb.js extension)")
      Logger.log(
        `Syncing all components from ${storyblokConfig.componentDirectory} directory...`
      )

      syncAllComponents(!!flags.ext, !!flags.presets)
    }

    if (args.type === "components" && !flags.all && flags.ext) {
      Logger.log(`Syncing provided components with ${storyblokConfig.schemaFileExt} extension...`)

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        syncProvidedComponents({components, presets: !!flags.presets, packageName: flags.packageName})
      }
    }

    if (args.type === "components" && !flags.all && !flags.ext && !flags.lock) {
      Logger.warning("### DEPRECATED method. Method of syncing files without .sb.js extension, will be removed in version 4.0.0 ###")
      Logger.warning("Use sb-mig sync components --ext instead (you need to update your schema files to be named with .sb.js extension)")
      Logger.log("Syncing provided components...")

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        syncComponents(components, !!flags.ext, !!flags.presets, flags.packageName)
      }
    }

    if (args.type === "datasources" && flags.all && !flags.ext) {
      this.error("Datasources are only synced while using --ext optioon. use sb-mig sync datasources --all --ext to sync all datasources with extension (default: .sb.datasources.js)")
    }

    if (args.type === "datasources" && !flags.all && !flags.ext) {
      const datasources = components
      this.error(`Datasources are only synced while using --ext optioon. use sb-mig sync datasources ${datasources.join(" ")} --ext to sync provided datasources with extension (default: .sb.datasources.js)`)
    }

    if (args.type === "datasources" && flags.all && flags.ext) {
      Logger.log("Syncing all datasources with extension...")

      syncAllDatasources()
    }

    if (args.type === "datasources" && !flags.all && flags.ext) {
      const datasources = components
      Logger.log("Syncing provided datasources with extension...")

      syncProvidedDatasources({datasources})
    }
  }
}
