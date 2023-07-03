import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import { readFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import {
    getFileContentWithRequire,
    getFilesContentWithRequire,
    isItFactory,
} from "../../utils/main.js";
import { preselectMigrations } from "../../utils/migrations.js";
import {
    discoverVersionMapping,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";

const MIGRATIONS_COMMANDS = {
    recognize: "recognize",
};

export const migrations = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        from: ["from"],
        empty: [],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, ["to"]);

    switch (command) {
        case MIGRATIONS_COMMANDS.recognize:
            Logger.warning(
                `Recognizing migrations you should apply... with command: ${command}`
            );

            if (isIt("from")) {
                // 1. take from flag - from what verison you comming
                const previousBackpackVersion = flags["from"];

                const fileName = "applied-backpack-migrations.json";

                // 2. read applied-backpack-migrations.json file to see what migrations was already applied
                let alreadyAppliedMigrationsFileContent;
                let alreadyAppliedMigrations;
                try {
                    alreadyAppliedMigrationsFileContent = (await readFile(
                        fileName
                    )) as string;
                    alreadyAppliedMigrations = JSON.parse(
                        alreadyAppliedMigrationsFileContent
                    ).migrations;
                } catch (e) {
                    console.log(`No file named: ${fileName}`);
                    console.log("Will create one now.");
                    alreadyAppliedMigrations = [];
                }

                // 3. read versionMapping for migrations to calculate stuff
                const versionMappingFile = discoverVersionMapping({
                    scope: SCOPE.all,
                    type: LOOKUP_TYPE.fileName,
                    fileNames: ["versionMapping"],
                });

                // Get content of migration config file
                const versionMappingFileContent = getFilesContentWithRequire({
                    files: versionMappingFile,
                })[0];

                // 4. calculate stuff taking into consideration all the facts and apply migrations, or console.log
                // commands to run
                let installedBackpackVersion;
                if (flags["to"]) {
                    installedBackpackVersion = flags["to"];
                } else {
                    const pkg = await getFileContentWithRequire({
                        file: path.join(process.cwd(), "package.json"),
                    });

                    installedBackpackVersion = pkg.dependencies[
                        "@ef-global/backpack"
                    ] as string;
                }

                console.log({
                    previousBackpackVersion,
                    installedBackpackVersion,
                });

                const whatToMigrate = preselectMigrations(
                    previousBackpackVersion,
                    installedBackpackVersion.replaceAll("^", ""),
                    versionMappingFileContent,
                    alreadyAppliedMigrations
                );

                console.log(
                    "Command you have to run to migrate (the best in that order): "
                );
                if (whatToMigrate.story.length > 0) {
                    whatToMigrate.story.forEach((migration) => {
                        console.log(
                            `yarn sb-mig migrate content --all --migration ${migration} --yes`
                        );
                    });
                } else {
                    console.log("No story to migrate. You are up to date.");
                }

                if (whatToMigrate.preset.length > 0) {
                    whatToMigrate.preset.forEach((migration) => {
                        console.log(
                            `yarn sb-mig migrate presets --all --migration ${migration} --yes`
                        );
                    });
                } else {
                    console.log("No story to migrate. You are up to date.");
                }
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
