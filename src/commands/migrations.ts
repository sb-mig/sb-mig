import type { CLIOptions } from "../utils/interfaces.js";

import path from "path";

import {
    discoverVersionMapping,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";
import { readFile } from "../utils/files.js";
import Logger from "../utils/logger.js";
import {
    getFileContentWithRequire,
    getFilesContentWithRequire,
    isItFactory,
} from "../utils/main.js";
import { preselectMigrations } from "../utils/migrations.js";

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
                console.log("Previous version: ", previousBackpackVersion);

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

                console.log(alreadyAppliedMigrations);

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

                console.log("This is content of version mapping");
                console.log(versionMappingFileContent);

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
                console.log("_____________");
                console.log(whatToMigrate);
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
