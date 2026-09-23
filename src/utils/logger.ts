import chalk from "chalk";

import { getActiveProgress } from "./progress.js";

/**
 * Every line this logger writes goes through one door, so a live progress line
 * can lend it the terminal row and take it back. Without a live line this is
 * exactly `console.log`.
 */
const say = (content: any) => {
    const progress = getActiveProgress();

    if (progress) {
        progress.printLine(String(content));
        return;
    }

    console.log(content);
};

export default class Logger {
    static log(content: any) {
        say(content);
    }

    static success(content: any) {
        say(chalk.green(`✓ ${content}`));
    }

    static warning(content: any) {
        say(chalk.yellow(`! ${content}`));
    }

    static error(content: any, { verbose } = { verbose: false }) {
        if (verbose) {
            say(content);
        } else {
            say(chalk.red(`✘ ${content}`));
        }
    }

    static upload(content: any) {
        say(chalk.blue(`↑ ${content}`));
    }

    static download(content: any) {
        say(chalk.yellow(`↓ ${content}`));
    }
}
