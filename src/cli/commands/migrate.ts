import type { MigrateFrom } from "../../api/data-migration/component-data-migration.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import {
    migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories,
} from "../../api/data-migration/component-data-migration.js";
import { managementApi } from "../../api/managementApi.js";
import { backupStories } from "../../api/stories/backup.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import { askForConfirmation } from "../helpers.js";
import {
    isItFactory,
    unpackElements,
    getFrom,
    getTo,
} from "../utils/cli-utils.js";

const MIGRATE_COMMANDS = {
    content: "content",
    presets: "presets",
};

const normalizeMigrationFlags = (
    migrationFlag: string | string[] | undefined,
): string[] => {
    if (Array.isArray(migrationFlag)) {
        return migrationFlag.filter(Boolean);
    }

    if (typeof migrationFlag === "string" && migrationFlag.length > 0) {
        return [migrationFlag];
    }

    return [];
};

export const migrate = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const rules = {
        empty: [],
        all: ["all", "migrateFrom"],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "to",
        "from",
        "fromFilePath",
        "pageId",
        "migration",
        "yes",
        "withSlug",
        "startsWith",
        "dryRun",
        "fileName",
    ]);

    Logger.warning(
        `This feature is in BETA. Use it at your own risk. The API might change in the future. (Probably in a standard Prisma like migration way)`,
    );

    switch (command) {
        case MIGRATE_COMMANDS.content: {
            Logger.log(`Migrating content with command: ${command}`);

            const fromFilePath = flags["fromFilePath"] as string | undefined;
            const migrateFromFlag = flags["migrateFrom"] as
                | MigrateFrom
                | undefined;
            const fromFallback =
                migrateFromFlag === "file" && fromFilePath
                    ? path.parse(fromFilePath).name
                    : undefined;
            const from =
                (flags["from"] as string | undefined) ||
                fromFallback ||
                getFrom(flags, apiConfig);
            const to = getTo(flags, apiConfig);
            const migrationConfigs = normalizeMigrationFlags(
                flags["migration"] as string | string[] | undefined,
            );
            const dryRun = flags["dryRun"] as boolean | undefined;
            const fileName = flags["fileName"] as string | undefined;
            const withSlugFlag = flags["withSlug"] as
                | string
                | string[]
                | undefined;
            const withSlug = Array.isArray(withSlugFlag)
                ? withSlugFlag
                : withSlugFlag
                  ? [withSlugFlag]
                  : undefined;
            const startsWith =
                (flags["startsWith"] as string | undefined) || undefined;

            if (migrationConfigs.length === 0) {
                throw new Error(
                    "Missing migration config. Pass at least one --migration value.",
                );
            }

            if (isIt("empty")) {
                const componentsToMigrate = unpackElements(input) || [""];

                const migrateFrom: MigrateFrom = "space";

                const runMigration = async () => {
                    Logger.warning("Preparing to migrate...");

                    if (!dryRun) {
                        await backupStories(
                            {
                                filename: `${from}--backup-before-migration___${migrationConfigs.join(
                                    "__",
                                )}`,
                                suffix: ".sb.stories",
                                spaceId: from,
                            },
                            apiConfig,
                        );
                    }

                    await migrateProvidedComponentsDataInStories(
                        {
                            itemType: "story",
                            from,
                            to,
                            migrateFrom,
                            componentsToMigrate,
                            migrationConfig: migrationConfigs,
                            filters: { withSlug, startsWith },
                            dryRun,
                            fromFilePath,
                            fileName,
                        },
                        apiConfig,
                    );
                };

                if (dryRun) {
                    await runMigration();
                } else {
                    await askForConfirmation(
                        "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                        runMigration,
                        () => {
                            Logger.warning(
                                "Migration not started, exiting the program...",
                            );
                        },
                        flags["yes"],
                    );
                }
            } else if (isIt("all")) {
                const migrateFrom: MigrateFrom = flags["migrateFrom"];

                const runMigration = async () => {
                    Logger.warning("Preparing to migrate...");

                    await migrateAllComponentsDataInStories(
                        {
                            itemType: "story",
                            from,
                            to,
                            migrateFrom,
                            migrationConfig: migrationConfigs,
                            filters: { withSlug, startsWith },
                            dryRun,
                            fromFilePath,
                            fileName,
                        },
                        apiConfig,
                    );
                };

                if (dryRun) {
                    await runMigration();
                } else {
                    await askForConfirmation(
                        "Are you sure you want to MIGRATE content (stories) in your space ? (it will overwrite stories)",
                        runMigration,
                        () => {
                            Logger.warning(
                                "Migration not started, exiting the program...",
                            );
                        },
                        flags["yes"],
                    );
                }
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info.",
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        }
        case MIGRATE_COMMANDS.presets: {
            Logger.log(`Migrating content with command: ${command}`);

            const migrationConfigs = normalizeMigrationFlags(
                flags["migration"] as string | string[] | undefined,
            );
            const fromFilePath = flags["fromFilePath"] as string | undefined;
            const migrateFromFlag = flags["migrateFrom"] as
                | MigrateFrom
                | undefined;
            const fromFallback =
                migrateFromFlag === "file" && fromFilePath
                    ? path.parse(fromFilePath).name
                    : undefined;
            const from =
                (flags["from"] as string | undefined) ||
                fromFallback ||
                getFrom(flags, apiConfig);
            const to = getTo(flags, apiConfig);

            if (migrationConfigs.length === 0) {
                throw new Error(
                    "Missing migration config. Pass exactly one --migration value for presets.",
                );
            }

            if (migrationConfigs.length > 1) {
                throw new Error(
                    "Multiple --migration values are currently supported only for 'migrate content'. Presets support a single migration config.",
                );
            }

            console.log("Migrating with presets");

            if (isIt("all")) {
                const migrateFrom: MigrateFrom = flags["migrateFrom"];
                const dryRun = flags["dryRun"] as boolean | undefined;
                const fileName = flags["fileName"] as string | undefined;

                const runMigration = async () => {
                    Logger.warning("Preparing to migrate...");

                    if (!dryRun) {
                        const response =
                            await managementApi.presets.getAllPresets(
                                apiConfig,
                            );

                        await createAndSaveToFile(
                            {
                                filename: "presets-backup",
                                res: response,
                            },
                            apiConfig,
                        );
                    }

                    await migrateAllComponentsDataInStories(
                        {
                            itemType: "preset",
                            from,
                            to,
                            migrateFrom,
                            migrationConfig: migrationConfigs[0] as string,
                            dryRun,
                            fromFilePath,
                            fileName,
                        },
                        apiConfig,
                    );
                };

                if (dryRun) {
                    await runMigration();
                } else {
                    await askForConfirmation(
                        "Are you sure you want to MIGRATE presets in your space ? (it will overwrite them)",
                        runMigration,
                        () => {
                            Logger.warning(
                                "Migration not started, exiting the program...",
                            );
                        },
                        flags["yes"],
                    );
                }
            } else {
                Logger.error(
                    "Wrong combination of flags. check help for more info.",
                );
                console.log("Passed flags: ");
                console.log(flags);
            }

            break;
        }
        default:
            console.log(`no command like that: ${command}`);
    }
};
