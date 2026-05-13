import type { MigrateFrom } from "../../api/data-migration/component-data-migration.js";
import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import {
    migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories,
} from "../../api/data-migration/component-data-migration.js";
import { buildStoryBackupBaseName } from "../../api/data-migration/file-naming.js";
import {
    parseMigrationComponentAliasFlags,
    parseMigrationComponentOverrideFlags,
} from "../../api/data-migration/migration-component-scope.js";
import { managementApi } from "../../api/managementApi.js";
import { backupStories } from "../../api/stories/backup.js";
import { parsePublishLanguagesOption } from "../../api/stories/stories.js";
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
        "migrationComponentAlias",
        "migrationComponents",
        "yes",
        "withSlug",
        "startsWith",
        "dryRun",
        "publish",
        "publishLanguages",
        "languagePublishStatePath",
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
            const migrationComponentAliases = parseMigrationComponentAliasFlags(
                flags["migrationComponentAlias"] as
                    | string
                    | string[]
                    | undefined,
            );
            const migrationComponentOverrides =
                parseMigrationComponentOverrideFlags(
                    flags["migrationComponents"] as
                        | string
                        | string[]
                        | undefined,
                );
            const dryRun = flags["dryRun"] as boolean | undefined;
            const publish = Boolean(flags["publish"]);
            const publishLanguagesFlag = flags["publishLanguages"] as
                | string
                | undefined;
            const languagePublishStatePath = flags[
                "languagePublishStatePath"
            ] as string | undefined;
            const publishLanguages = publishLanguagesFlag
                ? parsePublishLanguagesOption(publishLanguagesFlag)
                : undefined;
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

            if (!publish && publishLanguagesFlag) {
                throw new Error(
                    "--publishLanguages requires --publish for 'migrate content'.",
                );
            }

            if (
                languagePublishStatePath &&
                (!publish || !publishLanguagesFlag)
            ) {
                throw new Error(
                    "--languagePublishStatePath requires --publish and --publishLanguages for 'migrate content'.",
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
                                filename: buildStoryBackupBaseName({
                                    from,
                                    fileName,
                                }),
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
                            migrationComponentAliases,
                            migrationComponentOverrides,
                            filters: { withSlug, startsWith },
                            dryRun,
                            publish,
                            publishLanguages,
                            fromFilePath,
                            fileName,
                            languagePublishStatePath,
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
                            migrationComponentAliases,
                            migrationComponentOverrides,
                            filters: { withSlug, startsWith },
                            dryRun,
                            publish,
                            publishLanguages,
                            fromFilePath,
                            fileName,
                            languagePublishStatePath,
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
            const migrationComponentAliases = parseMigrationComponentAliasFlags(
                flags["migrationComponentAlias"] as
                    | string
                    | string[]
                    | undefined,
            );
            const migrationComponentOverrides =
                parseMigrationComponentOverrideFlags(
                    flags["migrationComponents"] as
                        | string
                        | string[]
                        | undefined,
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
            const publish = Boolean(flags["publish"]);
            const publishLanguagesFlag = flags["publishLanguages"] as
                | string
                | undefined;
            const languagePublishStatePath = flags[
                "languagePublishStatePath"
            ] as string | undefined;

            if (migrationConfigs.length === 0) {
                throw new Error(
                    "Missing migration config. Pass exactly one --migration value for presets.",
                );
            }

            if (publish) {
                throw new Error(
                    "--publish is only supported for 'migrate content'. Presets cannot be published.",
                );
            }

            if (publishLanguagesFlag) {
                throw new Error(
                    "--publishLanguages is only supported for 'migrate content'. Presets cannot be published.",
                );
            }

            if (languagePublishStatePath) {
                throw new Error(
                    "--languagePublishStatePath is only supported for 'migrate content'. Presets cannot be published.",
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
                            migrationComponentAliases,
                            migrationComponentOverrides,
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
