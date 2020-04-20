import {Command, flags} from '@oclif/command'
const configValues = require("../config/config")

export default class Debug extends Command {
  static description = 'Output extra debugging'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  static args = []

  async run() {
    const {args, flags} = this.parse(Debug)

    this.log(configValues)
  }
}
