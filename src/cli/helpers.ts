import readline from "node:readline/promises";

import chalk from "chalk";

export const askForConfirmation = async (
    message: string,
    resolveYes: () => void | Promise<void>,
    resolveNo: () => void | Promise<void>,
    ci?: boolean,
) => {
    if (ci) {
        await resolveYes();
        return;
    }
    // This section has to be changed, it was fast solution to asking for confirmation
    // need to reimplement it better
    await new Promise((resolve) => {
        setTimeout(() => {
            console.log(" ");
            console.log(" ");
            resolve(true);
        }, 3000);
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.red(`${message} (y/n) > `),
    });

    rl.prompt();
    for await (const deletionConfirmation of rl) {
        if (deletionConfirmation.trim() !== "y") {
            await resolveNo();
            process.exit(0);
        } else {
            if (deletionConfirmation) {
                await resolveYes();

                break;
            }
        }
        rl.prompt();
    }
};
