import ora from 'ora';
import { flags } from '@oclif/command'
import Command from 'sb-mig/lib/core'
import { syncComponents } from 'sb-mig/lib/api/migrate'
import { installComponentCommand, installProvidedComponents } from '@sb-mig/plugin-add-components/lib/api/add';
import { copyComponents } from '@sb-mig/plugin-add-components/lib/api/copy';
import { updateComponentsJs } from '@sb-mig/plugin-add-components/lib/api/update';
import { cloneRepo, createSpace, removeAndModifyFiles } from '../api';

export default class Bootstrap extends Command {
  static description = 'Bootstrap all provided component base of storylok.component.lock.js file.'

  static examples = [
    `$ sb-mig bootstrap`,
    `$ sb-mig bootstrap [path-to-lock-file]`,
  ]

  static strict = false;

  static flags = {
    help: flags.help({ char: 'h' }),
  }

  static args = [{ name: 'path' }]

  async run() {
    const { args, argv, flags } = this.parse(Bootstrap)
    const { boilerplateUrl } = this.storyblokConfig()
    const storyblokComponentsLock = this.storyblokComponentsConfig()

    console.log(`Bootstraping using storyblok.component.lock.js file.`)
    console.log("this current lock file: ")
    const allStoryblokComponents = storyblokComponentsLock.getAllData()
    const allStoryblokComponentsEntries = Object.entries(allStoryblokComponents)

    const allLocalStoryblokComponents = allStoryblokComponentsEntries.filter((component) => component[1].location === 'local' && component[1].name !== undefined)
    const allNodeModulesStoryblokComponents = allStoryblokComponentsEntries.filter((component) => component[1].location === 'node_modules' && component[1].name !== undefined)

    const allLocalStoryblokComponentsNames = allLocalStoryblokComponents.map(component => component[1].name)
    console.log(allLocalStoryblokComponentsNames)

    syncComponents(allLocalStoryblokComponentsNames, 'sb.js', false, true);

    // syncComponents(components, storyblokConfig.schemaFileExt, !!flags.presets, flags.packageName)


    console.log("local: ", allLocalStoryblokComponents);
    console.log("------------------------------------------------------------");
    console.log("node_modules: ", allNodeModulesStoryblokComponents);


  }
}



