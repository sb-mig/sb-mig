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
    languagePublishStateDescription,
    storyVersionsDescription,
    publishedLayerExportDescription,
    revertDescription,
    migrationsDescription,
    copyDescription,
} from "./cli-descriptions.js";
import { pipe, prop } from "./utils/cli-utils.js";

const app: any = () => ({
    cli: meow(mainDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: (cli: any) => cli.showHelp(0),
});

app.sync = () => ({
    cli: meow(syncDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { sync } = await import("./commands/sync.js");
        await sync(cli);
    },
});

app.copy = () => ({
    cli: meow(copyDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { copyCommand } = await import("./commands/copy.js");
        await copyCommand(cli);
    },
});

app.migrate = () => ({
    cli: meow(migrateDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
        flags: {
            from: {
                type: "string",
            },
            fromFilePath: {
                type: "string",
            },
            to: {
                type: "string",
            },
            migrateFrom: {
                type: "string",
                default: "space",
                isRequired: true,
            },
            migration: {
                type: "string",
                isMultiple: true,
            },
            migrationComponentAlias: {
                type: "string",
                isMultiple: true,
            },
            migrationComponents: {
                type: "string",
                isMultiple: true,
            },
            withSlug: {
                type: "string",
                isMultiple: true,
            },
            startsWith: {
                type: "string",
            },
            dryRun: {
                type: "boolean",
                default: false,
            },
            publicationMode: {
                type: "string",
            },
            publicationLanguages: {
                type: "string",
            },
            languagePublishStatePath: {
                type: "string",
            },
            fileName: {
                type: "string",
            },
            manifest: {
                type: "string",
            },
        },
    }),
    action: async (cli: any) => {
        const { migrate } = await import("./commands/migrate.js");
        await migrate(cli);
    },
});

app["language-publish-state"] = () => ({
    cli: meow(languagePublishStateDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
        flags: {
            from: {
                type: "string",
            },
            accessToken: {
                type: "string",
            },
            languages: {
                type: "string",
                default: "all",
            },
            withSlug: {
                type: "string",
                isMultiple: true,
            },
            startsWith: {
                type: "string",
            },
            fileName: {
                type: "string",
            },
            outputPath: {
                type: "string",
            },
        },
    }),
    action: async (cli: any) => {
        const { languagePublishState } =
            await import("./commands/language-publish-state.js");
        await languagePublishState(cli);
    },
});

app["story-versions"] = () => ({
    cli: meow(storyVersionsDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
        flags: {
            from: {
                type: "string",
            },
            storyId: {
                type: "string",
            },
            withSlug: {
                type: "string",
            },
            showContent: {
                type: "boolean",
                default: true,
            },
            page: {
                type: "number",
                default: 1,
            },
            perPage: {
                type: "number",
                default: 25,
            },
            raw: {
                type: "boolean",
                default: false,
            },
            outputPath: {
                type: "string",
            },
        },
    }),
    action: async (cli: any) => {
        const { storyVersions } = await import("./commands/story-versions.js");
        await storyVersions(cli);
    },
});

app["published-layer-export"] = () => ({
    cli: meow(publishedLayerExportDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
        flags: {
            from: {
                type: "string",
            },
            all: {
                type: "boolean",
                default: false,
            },
            storyId: {
                type: "string",
                isMultiple: true,
            },
            withSlug: {
                type: "string",
                isMultiple: true,
            },
            startsWith: {
                type: "string",
            },
            fileName: {
                type: "string",
            },
            outputPath: {
                type: "string",
            },
            versionsPerPage: {
                type: "number",
                default: 25,
            },
            maxVersionPages: {
                type: "number",
                default: 4,
            },
        },
    }),
    action: async (cli: any) => {
        const { publishedLayerExport } =
            await import("./commands/published-layer-export.js");
        await publishedLayerExport(cli);
    },
});

app.revert = () => ({
    cli: meow(revertDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { revert } = await import("./commands/revert.js");
        await revert(cli);
    },
});

app.discover = () => ({
    cli: meow(discoverDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { discover } = await import("./commands/discover.js");
        await discover(cli);
    },
});

app.migrations = () => ({
    cli: meow(migrationsDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { migrations } = await import("./commands/migrations.js");
        await migrations(cli);
    },
});

app.remove = () => ({
    cli: meow(removeDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { remove } = await import("./commands/remove.js");
        await remove(cli);
    },
});

app.backup = () => ({
    cli: meow(backupDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { backup } = await import("./commands/backup.js");
        await backup(cli);
    },
});

app.debug = () => ({
    cli: meow(debugDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async () => {
        const { debug } = await import("./commands/debug.js");
        await debug();
    },
});

app.init = () => ({
    cli: meow(initDescription, {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { init } = await import("./commands/init.js");
        await init(cli);
    },
});

app.test = () => ({
    cli: meow("nothing", {
        importMeta: import.meta,
        booleanDefault: undefined,
    }),
    action: async (cli: any) => {
        const { testCommand } = await import("./commands/test.js");
        await testCommand(cli);
    },
});

const getSubcommand = (cliObject: any, level: any) =>
    pipe(prop("input"), prop(level), (name: any) => prop(name)(cliObject))(
        prop("cli")(cliObject()),
    );

const cli = async (cliObject: any, level = 0): Promise<any> => {
    const { cli: nextCli, action } = cliObject();
    const subCommand = getSubcommand(cliObject, level);
    return subCommand
        ? await cli(subCommand, level + 1)
        : nextCli.flags.help
          ? nextCli.showHelp(0)
          : await action(nextCli);
};

await cli(app);
