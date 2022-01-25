#! /usr/bin/env node
import meow from "meow";
import { debug } from "./commands/debug.js";
import { pipe, prop } from "./utils/main.js";
import { sync } from "./commands/sync.js";
import { backup } from "./commands/backup.js";
import {
    backupDescription,
    debugDescription,
    mainDescription,
    syncDescription,
} from "./cli-descriptions.js";

const app = () => ({
    cli: meow(mainDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => cli.showHelp(),
});

app.sync = () => ({
    cli: meow(syncDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        sync(cli);
    },
});

app.backup = () => ({
    cli: meow(backupDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        backup(cli);
    },
});

app.debug = () => ({
    cli: meow(debugDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        debug(cli);
    },
});

const getSubcommand = (cliObject: any, level: any) =>
    pipe(prop("input"), prop(level), (name: any) => prop(name)(cliObject))(
        prop("cli")(cliObject())
    );

const cli = (cliObject: any, level = 0): any => {
    const { cli: nextCli, action } = cliObject();
    const subCommand = getSubcommand(cliObject, level);
    return subCommand
        ? cli(subCommand, level + 1)
        : nextCli.flags.help
        ? nextCli.showHelp()
        : action(nextCli);
};

cli(app);
