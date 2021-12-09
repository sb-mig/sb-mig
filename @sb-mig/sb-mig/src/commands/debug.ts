import {flags} from '@oclif/command'
import Command from '../core'

// TODO: implement --verbose flag to be available in every command
export default class Debug extends Command {
    static description = 'Output extra debugging';

    static flags = {
      help: flags.help({char: 'h'}),
    };

    static args = [];

    async run() {
      // const {} = this.parse(Debug)

      const config = this.storyblokConfig()
      const componentsConfig = this.storyblokComponentsConfig().getAllData()

      // eslint-disable-next-line no-console
      console.log('Thius are changes!')

      // eslint-disable-next-line no-console
      console.log('storyblok.config.js: ', config, '\n')
      // eslint-disable-next-line no-console
      console.log('storyblok.components.lock.js: ', componentsConfig)

      const test = '2'
      // eslint-disable-next-line no-console
      console.log(test)
    }
}
