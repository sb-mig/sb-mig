const chalk = require("chalk");
const figlet = require("figlet");

class Logger {
  constructor(name) {
    this.name = name;
  }

  static bigLog(content) {
    console.log(
      chalk.yellow(figlet.textSync(content, { horizontalLayout: "full" }))
    );
  }

  static log(content) {
    console.log(content);
  }

  static success(content) {
    console.log(chalk.green(`✓ ${content}`));
  }

  static warning(content) {
    console.log(chalk.yellow(`! ${content}`));
  }

  static error(content, { verbose } = { verbose: false }) {
    if (verbose) {
      console.log(content);
    } else {
      console.log(chalk.red(`✘ ${content}`));
    }
  }
}

module.exports = Logger;
