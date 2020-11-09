import { flags } from '@oclif/command'
import Command from '../core'
import storyblokConfig from "../config/config"
import Logger from "../utils/logger"
import { sync2AllComponents, syncAllComponents, syncComponents, syncProvidedComponents } from '../api/migrate'
import { syncProvidedDatasources, syncAllDatasources } from '../api/datasources'
import { syncAllRoles, syncProvidedRoles} from '../api/roles'

export default class Migrate extends Command {
  static description = 'Migrate content ## BETA ##'

  static examples = [
    `$ sb-mig migrate --pull`,
    `$ sb-mig migrate --push`,
  ]

  static flags = {
    help: flags.help({ char: 'h' }),
    pull: flags.boolean({ char: 'a', description: "Pull some content stories." }),
    push: flags.boolean({ char: 'e', description: "Push some content stories." }),
  }

  static strict = false;

  static args = [
  ]
  // static args = [
  //   { name: 'type', description: "What to synchronize", options: ['components', 'datasources', 'roles'], required: true },
  //   { name: "list", description: "Space separated list of component names. Example: card product-card row layout" }
  // ]

  async run() {
    const { argv, args, flags } = this.parse(Migrate)
    const content = argv.splice(1, argv.length);

    if (flags.pull) {
      Logger.log("Pulling content from space...")

      // pullContent()
    }

    if (flags.push) {
      Logger.log("Pushing content to space...")

      // pushContent()
    }
  }
}
