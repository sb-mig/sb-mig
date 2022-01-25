import chalk from "chalk";

export default class Logger {
    static log(content: any) {
        console.log(content);
    }

    static success(content: any) {
        console.log(chalk.green(`✓ ${content}`));
    }

    static warning(content: any) {
        console.log(chalk.yellow(`! ${content}`));
    }

    static error(content: any, { verbose } = { verbose: false }) {
        if (verbose) {
            console.log(content);
        } else {
            console.log(chalk.red(`✘ ${content}`));
        }
    }
}
