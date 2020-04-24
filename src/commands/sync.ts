import { Command, flags } from '@oclif/command'
import { componentDirectory, schemaFileExt, componentsDirectories} from "../config/config";
import Logger from "../utils/logger";
import * as migrate from '../api/migrate';

export default class Sync extends Command {
  static description = 'Synchronize components, datasources with Storyblok space.'

  static flags = {
    help: flags.help({ char: 'h' }),
    all: flags.boolean({ char: 'a', description: "Synchronize all components." }),
    ext: flags.boolean({ char: 'e', description: "Synchronize with file extension. Default extension: '.sb.js'" }),
    presets: flags.boolean({ char: 'p', description: "Synchronize components with presets." }),
  }

  static strict = false;

  static args = [
    { name: 'type', description: "What to synchronize", options: ['components', 'datasources'], required: true },
    { name: "list", description: "Space separated list of component names. Example: card product-card row layout" }
  ]

  async run() {
    const { argv, args, flags } = this.parse(Sync)
    const components = argv.splice(1, argv.length);

    if (args.type === "components" && flags.all && flags.ext) {
      Logger.log(`Syncing all components with ${schemaFileExt} extension...`)
      migrate.syncAllComponents(schemaFileExt, !!flags.presets)
    }

    if (args.type === "components" && flags.all && !flags.ext) {
      Logger.log(
        `Syncing all components from ${componentDirectory} directory...`
      )

      migrate.syncAllComponents(!!flags.ext, !!flags.presets)
    }

    if (args.type === "components" && !flags.all && flags.ext) {
      Logger.log(
        `Syncing provided components with ${schemaFileExt} extension, inside [${componentsDirectories.join(
          ", "
        )}] directories ...`
      )

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        migrate.syncComponents(components, schemaFileExt, !!flags.presets)
      }
    }

    if (args.type === "components" && !flags.all && !flags.ext) {
      Logger.log("Syncing provided components...")

      if (components.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        )
      } else {
        migrate.syncComponents(components, !!flags.ext, !!flags.presets)
      }
    }

    if (args.type === "datasources") {
      // TODO: implement syncing datasources
      this.error("There is no implementation for synchronizing datasources, yet.")
    }
  }
}
