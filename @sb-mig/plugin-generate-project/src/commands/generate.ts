// @ts-ignore
import * as yarnOrNpm from 'yarn-or-npm';
import * as execa from 'execa';
import * as ora from 'ora';
import { flags } from '@oclif/command'
import Command from 'sb-mig/lib/core'
import { installComponentCommand, installProvidedComponents } from '@sb-mig/plugin-add-components/lib/api/add';
import { cloneRepo, createSpace, removeAndModifyFiles } from '../api';

export default class Hello extends Command {
  static description = 'Generate whole project with sb-mig generate and sb-mig add components'

  static examples = [
    `$ sb-mig generate ?`,
  ]

  static flags = {
    help: flags.help({ char: 'h' }),
    // flag with a value (-n, --name=VALUE)
    name: flags.string({ char: 'n', description: 'name to print' }),
    // flag with no value (-f, --force)
    force: flags.boolean({ char: 'f' }),
  }

  static args = [{ name: 'file' }]

  async run() {
    const { args, flags } = this.parse(Hello)
    const { boilerplateUrl } = this.storyblokConfig()

    console.log(`Starting generating project...`)
    console.log(`Creating start project...`)
    console.log(`Using ${boilerplateUrl} boilerplate...`)

    let spinner = ora(`Cloning repo...\n`).start()
    const clonedRepo = await cloneRepo(boilerplateUrl);
    if (clonedRepo.failed) {
      spinner.stop();
      this.exit();
    }
    spinner.stop()

    spinner = ora(`Creating space...\n`).start()
    const {
      data: {
        space
      }
    } = await createSpace(this.api().spaces.createSpace, 'new-space-4')
    spinner.stop()
    console.log("this is a space: ", space)

    removeAndModifyFiles(space)
    // console.log(`Space ${program.args[0]} has been created.`)




    // const {
    //   data: { space }
    // } = await api.createSpace(program.args[0])

    // if (args.type === "components" && !flags.copy) {

    //   let spinner = ora(`Installing provided components...\n`).start()
    //   const installedComponents = await installProvidedComponents(components);
    //   spinner.stop()

    //   console.log(installedComponents);

    //   spinner = ora(`Updating components.js file...\n`).start()
    //   const data = updateComponentsJs(installedComponents, false);
    //   spinner.stop()
    // }

    // if (args.type === "components" && flags.copy) {

    //   let spinner = ora(`Installing provided components...\n`).start()
    //   const installedComponents = await installProvidedComponents(components);
    //   spinner.stop()

    //   console.log(installedComponents);

    //   spinner = ora(`Copying components files to local system...\n`).start()
    //   const dataAgain = await copyComponents(components);
    //   spinner.stop()

    //   spinner = ora(`Updating components.js file...\n`).start()
    //   const data = updateComponentsJs(installedComponents, true);
    //   spinner.stop()
    // }
  }
}



