#! /usr/bin/env node
import meow from "meow";

import {
    backupDescription,
    debugDescription,
    mainDescription,
    syncDescription,
    removeDescription,
    initDescription,
    discoverDescription,
    migrateDescription,
    revertDescription,
    migrationsDescription
} from "./cli-descriptions.js";
import { backup } from "./commands/backup.js";
import { debug } from "./commands/debug.js";
import { discover } from "./commands/discover.js";
import { init } from './commands/init.js'
import {migrate} from "./commands/migrate.js";
import {migrations} from './commands/migrations.js';
import {remove} from "./commands/remove.js";
import {revert} from "./commands/revert.js";
import { sync } from "./commands/sync.js";
import { pipe, prop } from "./utils/main.js";

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

app.migrate = () => ({
    cli: meow(migrateDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
        flags: {
            from: {
                type: "string"
            },
            to: {
                type: "string"
            },
            migrateFrom: {
                type: "string",
                default: "space",
                isRequired: true
            }
        }
    }),
    action: (cli: any) => {
        migrate(cli);
    },
});

app.revert = () => ({
    cli: meow(revertDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        revert(cli);
    },
});

app.discover = () => ({
    cli: meow(discoverDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        discover(cli);
    },
});

app.migrations = () => ({
    cli: meow(migrationsDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        migrations(cli);
    },
});

app.remove = () => ({
    cli: meow(removeDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        remove(cli);
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
    action: () => {
        debug();
    },
});

app.init = () => ({
    cli: meow(initDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => {
        init(cli);
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
