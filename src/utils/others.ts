import readline from "node:readline/promises";
import chalk from "chalk";

export const generateDatestamp = (datestamp: Date) => {
    const year = datestamp.getFullYear();
    const month = datestamp.getMonth() + 1;
    const day = datestamp.getDate();
    const hours = datestamp.getHours();
    const minutes = datestamp.getMinutes();
    const seconds = datestamp.getSeconds();

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

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
