import { flags } from '@oclif/command'
import Command from '../core'
import {getAllComponents} from '../api/components'

// TODO: implement --verbose flag to be available in every command
export default class Debug extends Command {
  static description = 'Output extra debugging'

  static flags = {
    help: flags.help({ char: 'h' }),
  }

  static args = []

  async run() {
    const { args, flags } = this.parse(Debug)

    // this.getStoryblokConfig();
    const config = this.getStoryblokConfig();

    console.log("find components with ext");
    console.log(this.findComponentsWithExt(config.schemaFileExt))
    const dupa = await getAllComponents();
    console.log(dupa)
  }
}
