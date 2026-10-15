import readline from "node:readline/promises";

import chalk from "chalk";

import { isJsonMode } from "./utils/agent-output.js";

/**
 * Whether a question can be asked at all. Without a terminal on stdin the
 * read would wait forever on a pipe an agent never writes to; under `--json`
 * a program is reading, not a person.
 */
export const canPrompt = (): boolean =>
    process.stdin.isTTY === true && !isJsonMode();

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

    if (!canPrompt()) {
        throw new Error(
            `Confirmation needed, but there is no interactive terminal to ask: "${message}" Re-run with --yes to confirm, or with --dry-run to only preview.`,
        );
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

    try {
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
    } finally {
        rl.close();
    }
};

/**
 * One yes/no question on the terminal. Resolves true only for an explicit
 * `y`/`yes`; an empty answer or anything else is a no.
 */
export const askYesNo = async (message: string): Promise<boolean> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const answer = await rl.question(`${message} `);
        return ["y", "yes"].includes(answer.trim().toLowerCase());
    } finally {
        rl.close();
    }
};
