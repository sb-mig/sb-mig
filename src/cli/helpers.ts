import readline from "node:readline/promises";

import chalk from "chalk";

export const askForConfirmation = async (
    message: string,
    resolveYes: () => void,
    resolveNo: () => void,
    ci?: boolean
) => {
    if (ci) {
        resolveYes();
        return;
    }
    // Prompt user immediately when not in CI

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.red(`${message} (y/n) > `),
    });

    rl.prompt();
    for await (const deletionConfirmation of rl) {
        if (deletionConfirmation.trim() !== "y") {
            resolveNo();
            process.exit(0);
        } else {
            if (deletionConfirmation) {
                resolveYes();

                break;
            }
        }
        rl.prompt();
    }
};
