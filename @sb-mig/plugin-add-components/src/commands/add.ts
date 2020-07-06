import { flags } from '@oclif/command'
import Command from 'sb-mig/lib/core'
import * as ora from 'ora';

import { installProvidedComponents, installAllDependencies } from '../api/add';
import { updateComponentsJs } from '../api/update';
import { copyComponents } from '../api/copy';

export default class Add extends Command {
  static description = 'Add and install components from repository.'

  static examples = [
    `$ sb-mig add components @storyblok-components/simple-text-block`,
    `$ sb-mig add components @storyblok-components/simple-text-block --copy`,
    `$ sb-mig add components @storyblok-components/simple-text-block @storyblok-components/advanced-carousel --copy`,
  ]

  static flags = {
    help: flags.help({ char: 'h' }),
    copy: flags.boolean({ char: 'c', description: "Copy downloaded files into your folder structure (outside node_modules)." }),
  }

  static strict = false;

  static args = [
    { name: 'type', description: "What to add and install to project.", options: ['components'], required: true },
    { name: "list", description: "Space separated list of component names with scope. Example: @storyblok-components/card @storyblok-components/product-card @storyblok-components/row @storyblok-componenst/layout" }
  ]

  async run() {
    const { args, argv, flags } = this.parse(Add)

    const components = argv.splice(1, argv.length);


    if (args.type === "components" && !flags.copy) {
      console.log("All scoped components already in a project: ");
      console.log(this.storyblokComponentsConfig().getAllData())

      let spinner = ora(`Installing provided components...\n`).start()
      const installedComponents = installProvidedComponents(components);
      spinner.stop()

      console.log("These are successfully installed components: ");
      console.log(installedComponents);

      spinner = ora(`Adding tracking information to tracking file...\n`).start()
      const installedComponentsTrackingData = this.storyblokComponentsConfig()
        .addComponentsToComponentsConfigFile(installedComponents, flags.copy);
      spinner.stop()

      this.storyblokComponentsConfig().setAllData(installedComponentsTrackingData)

      spinner = ora(`Updating components.js file...\n`).start()
      updateComponentsJs(
        installedComponents,
        false,
        this.storyblokComponentsConfig(),
        this.storyblokConfig()
      );
      spinner.stop()

      this.storyblokComponentsConfig().updateComponentsConfigFile()
    }

    if (args.type === "components" && flags.copy) {

      console.log("All scoped components already in a project: ");
      console.log(this.storyblokComponentsConfig().getAllData())

      let spinner = ora(`Installing provided components...\n`).start()
      const installedComponents = installProvidedComponents(components);
      spinner.stop()

      console.log("These are successfully installed components: ");
      console.log(installedComponents);

      spinner = ora(`Copying components files to local system...\n`).start()
      const dataAgain = copyComponents(components, this.storyblokComponentsConfig(), this.storyblokConfig());
      spinner.stop()

      spinner = ora(`Adding tracking information to tracking file...\n`).start()
      const installedComponentsTrackingData = this.storyblokComponentsConfig()
        .addComponentsToComponentsConfigFile(installedComponents, flags.copy);
      spinner.stop()

      this.storyblokComponentsConfig().setAllData(installedComponentsTrackingData)

      spinner = ora(`Updating components.js file...\n`).start()
      updateComponentsJs(
        installedComponents,
        true,
        this.storyblokComponentsConfig(),
        this.storyblokConfig()
      );
      spinner.stop()

      this.storyblokComponentsConfig().updateComponentsConfigFile()
    }

    let spinner = ora(`Installing all dependencies...\n`).start()
    await installAllDependencies()
    spinner.stop()
  }
}
