import ora from 'ora';
import { flags } from '@oclif/command'
import Command from 'sb-mig/lib/core'
import { installProvidedComponents } from '@sb-mig/plugin-add-components/lib/api/add';
import { copyComponents } from '@sb-mig/plugin-add-components/lib/api/copy';
import { cloneRepo, createSpace, removeAndModifyFiles } from '../api';

export default class Hello extends Command {
  static description = 'Generate whole project with sb-mig generate and sb-mig add components'

  static examples = [
    `$ sb-mig generate project-name --add @storyblok-components/ui-accordion @storyblok-components/ui-section`,
  ]

  static strict = false;

  static flags = {
    help: flags.help({ char: 'h' }),
    add: flags.boolean({ char: 'a', description: 'List of components to add to project' }),
    copy: flags.boolean({ char: 'c', description: "Copy downloaded files into your folder structure (outside node_modules)." }),
    nospace: flags.boolean({ char: 'n', description: "Do not create a space for project. (for example when you have one already)" }),
  }

  static args = [{ name: 'project-name' }]

  async run() {
    const { args, argv, flags } = this.parse(Hello)
    const { boilerplateUrl } = this.storyblokConfig()

    console.log(`Starting generating project...`)
    console.log(`Creating start project...`)
    console.log(`Using ${boilerplateUrl} boilerplate...`)

    const components = argv.splice(1, argv.length);
    const projectName = argv[0];

    let spinner = ora(`Cloning repo...\n`).start()
    const clonedRepo = await cloneRepo(boilerplateUrl);
    if (clonedRepo.failed) {
      spinner.stop();
      this.exit();
    }
    spinner.stop()

    if (!flags.nospace) {
      spinner = ora(`Creating space...\n`).start()
      const {
        data: {
          space
        }
      } = await createSpace(this.api().spaces.createSpace, projectName)
      spinner.stop()

      removeAndModifyFiles(space)
      console.log(`Space has been created.`)
    }

    if (flags.add && !flags.copy) {

      let spinner = ora(`Installing provided components...\n`).start()
      const installedComponents = installProvidedComponents(components);
      spinner.stop()

      console.log(`Adding tracking information to tracking file...\n`)
      const installedComponentsTrackingData = this.storyblokComponentsConfig().addComponentsToComponentsConfigFile({ installedComponents, local: flags.copy });

      delete installedComponentsTrackingData['undefined']
  
      this.storyblokComponentsConfig().setAllData(installedComponentsTrackingData)
      this.storyblokComponentsConfig().updateStoryblokComponentsFile()
      this.storyblokComponentsConfig().updateStoryblokComponentStylesFile()
      this.storyblokComponentsConfig().updateComponentsConfigFile()

      console.log("All done !")
    }

    if (flags.add && flags.copy) {
      let spinner = ora(`Installing provided components...\n`).start()
      const installedComponents = await installProvidedComponents(components);
      spinner.stop()

      const componentsToCopy = installedComponents.map(component => `${component.scope}/${component.name}`)

      console.log(`Copying components files to local system...\n`)
      await copyComponents({ components: componentsToCopy });

      console.log(`Adding tracking information to tracking file...\n`)
      const installedComponentsTrackingData = this.storyblokComponentsConfig().addComponentsToComponentsConfigFile({ installedComponents, local: flags.copy });

      delete installedComponentsTrackingData['undefined']
  

      this.storyblokComponentsConfig().setAllData(installedComponentsTrackingData)
      this.storyblokComponentsConfig().updateStoryblokComponentsFile()
      this.storyblokComponentsConfig().updateStoryblokComponentStylesFile()
      this.storyblokComponentsConfig().updateComponentsConfigFile()


      console.log("All done !")
    }
  }
}



