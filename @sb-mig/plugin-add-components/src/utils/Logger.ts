import * as chalk from 'chalk';
import * as figlet from 'figlet';

export default class Logger {
  name: any;

  constructor(name: any) {
    this.name = name
  }

  static bigLog(content: any) {
    console.log(
      chalk.yellow(figlet.textSync(content, { horizontalLayout: "full" }))
    )
  }

  static log(content: any) {
    console.log(content)
  }

  static success(content: any) {
    console.log(chalk.green(`✓ ${content}`))
  }

  static warning(content: any) {
    console.log(chalk.yellow(`! ${content}`))
  }

  static error(content: any, { verbose } = { verbose: false }) {
    if (verbose) {
      console.log(content);
    } else {
      console.log(chalk.red(`✘ ${content}`))
    }
  }
}
