import {flags} from '@oclif/command'
import Command from '../core'
import storyblokConfig from '../config/config'
import Logger from '../utils/logger'
import {
  sync2AllComponents,
  syncAllComponents,
  syncComponents,
  syncProvidedComponents,
} from '../api/migrate'
import {
  syncProvidedDatasources,
  syncAllDatasources,
} from '../api/datasources'
import {syncAllRoles, syncProvidedRoles} from '../api/roles'
import {getAllStories, getStoryByName, pullContent, pushContent} from '../api/stories'

export default class Migrate extends Command {
    static description = '## BETA ## Migrate content';

    static examples = ['$ sb-mig migrate --pull', '$ sb-mig migrate --push'];

    static flags = {
      help: flags.help({char: 'h'}),
      pull: flags.boolean({
        char: 'a',
        description: 'Pull some content stories.',
      }),
      push: flags.boolean({
        char: 'e',
        description: 'Push some content stories.',
      }),
      from: flags.string({char: 'f', description: 'From which space id you want to migrate ?'}),
      to: flags.string({char: 't', description: 'To which space id you want to migrate ?'}),
    };

    static strict = false;

    static args = [
      {name: 'type', description: 'What to migrate', options: ['stories', 'assets'], required: true},
      {name: 'list', description: 'Space separated list of Stories names to migrate'},
    ]

    async run() {
      const {argv, args, flags} = this.parse(Migrate)
      const content = argv.splice(1, argv.length)

      if (flags.from && flags.to) {
        const stories = content
        Logger.log('From which space: ', flags.from) // 97303
        Logger.log('To which space: ', flags.to) // 97556
        Logger.log('Stories: ', stories)

        const data = await getStoryByName({storyName: stories[0], spaceId: flags.from})
        console.log("This is result: ")
        console.log(data)
      }

      if (flags.pull) {
        Logger.log('Pulling content from space...')

        pullContent()
      }

      if (flags.push) {
        Logger.log('Pushing content to space...')

        pushContent()
      }
    }
}
