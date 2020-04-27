import { Command, flags } from '@oclif/command'
import * as ora from 'ora';

import { createComponent } from '../api/create';
import Logger from '../utils/Logger';

export default class CreateComponent extends Command {
  static description = 'Create package inside sb-mig compliant components monorepo.'

  static examples = [
    `$ sb-mig create component-name`,
  ]

  static flags = {
    help: flags.help({ char: 'h' }),
    force: flags.boolean({ char: 'f' }),
    repo: flags.string({ char: 'r', description: "Custom repository url" })
  }

  static args = [{ name: 'component-name' }]

  async run() {
    const { args, flags } = this.parse(CreateComponent)
    let componentBoilerplateRepo = 'git@github.com:sb-mig/storyblok-components-boilerplate-component.git';

    if (flags.repo) {
      componentBoilerplateRepo = flags.repo
    }

    let spinner = ora(`Creating component for scope...\n`).start()
    await createComponent(componentBoilerplateRepo, args['component-name']);
    spinner.stop()
    Logger.success(`${args['component-name']} created.`)
  }
}
