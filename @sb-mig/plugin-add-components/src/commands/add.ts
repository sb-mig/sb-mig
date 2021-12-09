import {flags} from '@oclif/command'
import Command from 'sb-mig/lib/core'

import {installProvidedComponents} from '../api/add'
import {copyComponents} from '../api/copy'
import Logger from '../utils/Logger'

export default class Add extends Command {
    static description = 'Add and install components from repository.';

    static examples = [
      '$ sb-mig add components @storyblok-components/simple-text-block',
      '$ sb-mig add components @storyblok-components/simple-text-block --copy',
      '$ sb-mig add components @storyblok-components/simple-text-block @storyblok-components/advanced-carousel --copy',
    ];

    static flags = {
      help: flags.help({char: 'h'}),
      copy: flags.boolean({
        char: 'c',
        description:
                'Copy downloaded files into your folder structure (outside node_modules)',
      }),
    };

    static strict = false;

    static args = [
      {
        name: 'type',
        description: 'What to add and install to project.',
        options: ['components'],
        required: true,
      },
      {
        name: 'list',
        description:
                'Space separated list of component names with scope. Example: @storyblok-components/card @storyblok-components/product-card @storyblok-components/row @storyblok-componenst/layout',
      },
    ];

    async run() {
      const {args, argv, flags} = this.parse(Add)

      const components = argv.splice(1, argv.length)

      if (args.type === 'components' && !flags.copy) {
        Logger.log('All scoped components already in a project: ')
        console.log(this.storyblokComponentsConfig().getAllData())

        Logger.log('Installing provided components...\n')
        const installedComponents = installProvidedComponents(components)

        Logger.log('These are successfully installed components: ')
        console.log(installedComponents)

        Logger.log('Adding tracking information to tracking file...\n')
        const installedComponentsTrackingData =
                this.storyblokComponentsConfig().addComponentsToComponentsConfigFile(
                  {installedComponents, local: flags.copy}
                )

        delete installedComponentsTrackingData.undefined

        this.storyblokComponentsConfig().setAllData(
          installedComponentsTrackingData
        )

        this.storyblokComponentsConfig().updateStoryblokComponentsFile()
        this.storyblokComponentsConfig().updateStoryblokComponentStylesFile()
        this.storyblokComponentsConfig().updateComponentsConfigFile()

        Logger.success('All done !')
      }

      if (args.type === 'components' && flags.copy) {
        Logger.log('All scoped components already in a project: ')
        console.log(this.storyblokComponentsConfig().getAllData())

        Logger.log('Installing provided components...\n')
        const installedComponents = installProvidedComponents(components)

        console.log('These are successfully installed components: ')
        console.log(installedComponents)

        const componentsToCopy = installedComponents.map(
          component => `${component.scope}/${component.name}`
        )

        Logger.log('Copying components files to local system...\n')
        await copyComponents({components: componentsToCopy})

        Logger.log('Adding tracking information to tracking file...\n')
        const installedComponentsTrackingData =
                this.storyblokComponentsConfig().addComponentsToComponentsConfigFile(
                  {installedComponents, local: flags.copy}
                )

        delete installedComponentsTrackingData.undefined

        this.storyblokComponentsConfig().setAllData(
          installedComponentsTrackingData
        )
        this.storyblokComponentsConfig().updateStoryblokComponentsFile()
        this.storyblokComponentsConfig().updateStoryblokComponentStylesFile()
        this.storyblokComponentsConfig().updateComponentsConfigFile()

        Logger.success('All done !')
      }
    }
}
