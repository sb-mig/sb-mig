import {Command, flags} from '@oclif/command'

export default class CreateComponent extends Command {
  static description = 'Create package inside sb-mig compliant components monorepo.'

  static examples = [
    `$ sb-mig create-component

git@github.com:sb-mig/storyblok-components-boilerplate-component.git for @storyblok-components
`,
  ]

  static flags = {
    help: flags.help({char: 'h'}),
    force: flags.boolean({char: 'f'}),
  }

  static args = [{name: 'boilerplate-repo'}]

  async run() {
    const {args, flags} = this.parse(CreateComponent)
    let componentBoilerplateRepo = 'git@github.com:sb-mig/storyblok-components-boilerplate-component.git';
    const componentsScope = '@storyblok-components'
    
    if(args['boilerplate-repo']) {
      componentBoilerplateRepo = args['boilerplate-repo']
    }

    this.log(`${componentBoilerplateRepo} for ${componentsScope}`);
  }
}
