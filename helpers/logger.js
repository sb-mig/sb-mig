const chalk = require("chalk");

class Logger {
  constructor(name) {
    this.name = name;
  }

  static log(content) {
    console.log(content);
  }

  static warning(content) {
    console.log(chalk.yellow(content));
  }

  static error(content) {
    console.log(chalk.red(content));
  }
}

module.exports = Logger;
