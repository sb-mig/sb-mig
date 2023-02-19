import readline from "node:readline/promises";
import chalk from "chalk";

export const generateDatestamp = (datestamp: Date) =>
    `${datestamp.getUTCFullYear()}-${datestamp.getUTCMonth()}-${datestamp.getUTCDay()}_${datestamp.getUTCHours()}-${datestamp.getUTCMinutes()}-${datestamp.getUTCSeconds()}`;

export const askForConfirmation = async (
    message: string,
    resolveYes: () => void,
    resolveNo: () => void
) => {
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
