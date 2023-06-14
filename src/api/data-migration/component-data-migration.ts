import type { RequestBaseConfig } from "../utils/request.js";

import path from "path";

import chalk from "chalk";

import storyblokConfig from "../../config/config.js";
import {
    discoverMigrationConfig,
    discoverStories,
    LOOKUP_TYPE,
    SCOPE,
} from "../../utils/discover.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { getFilesContentWithRequire, isObjectEmpty } from "../../utils/main.js";
import { modifyOrCreateAppliedMigrationsFile } from "../../utils/migrations.js";
import { managementApi } from "../managementApi.js";

export type MigrateFrom = "file" | "space";

interface MigrateItems {
    itemType: "story" | "preset";
    from: string;
    to: string;
    migrateFrom: MigrateFrom;
    migrationConfig: string;
    componentsToMigrate: string[];
}

interface MigratePresets {
    from: string;
    to: string;
    migrateFrom: MigrateFrom;
    migrationConfig: string;
    presetsToMigrate: string[];
}

interface ReplaceComponentData {
    parent: any;
    key: any;
    components: string[];
    mapper: Record<string, (data: any) => any>;
    depth: number;
    maxDepth: number;
    sumOfReplacing: any;
}

export type MapperDefinition = (data: any) => any;

function replaceComponentData({
    parent,
    key,
    components,
    mapper,
    depth,
    maxDepth,
    sumOfReplacing,
}: ReplaceComponentData) {
    let currentMaxDepth = depth;
    if (storyblokConfig.debug) {
        Logger.warning(`Current max depth: ${depth}`);
    }

    if (typeof parent[key] === "object") {
        if (
            parent[key]?.component &&
            components.includes(parent[key].component)
        ) {
            const { ...rest } = parent[key];
            const { data: dataToReplace, wasReplaced } = (
                mapper[parent[key].component] as MapperDefinition
            )(parent[key]);

            parent[key] = { ...rest, ...dataToReplace };

            if (storyblokConfig.debug) {
                console.log(
                    chalk.yellow(
                        `______________ In __________________________________________`
                    )
                );
                console.log(" ");
                console.log(
                    `   Data from ${chalk.blue(
                        dataToReplace.component
                    )} component,\n   with _uid: ${chalk.blue(
                        dataToReplace._uid
                    )} `
                );
                console.log("Was it replaced? ", wasReplaced);
                console.log(
                    chalk.yellow(
                        `____________________________________________________________`
                    )
                );
                console.log(" ");
            }

            if (wasReplaced) {
                sumOfReplacing[dataToReplace.component] = sumOfReplacing[
                    dataToReplace.component
                ]
                    ? sumOfReplacing[dataToReplace.component] + 1
                    : 1;

                console.log("Sum of replacing: ");
                console.log(sumOfReplacing);
            }
        }

        if (Array.isArray(parent[key])) {
            for (let i = 0; i < parent[key].length; i++) {
                const childMaxDepth = replaceComponentData({
                    parent: parent[key],
                    key: i,
                    components,
                    mapper,
                    depth: depth + 1,
                    maxDepth,
                    sumOfReplacing,
                });
                currentMaxDepth = Math.max(currentMaxDepth, childMaxDepth);
            }
        } else {
            for (const subKey in parent[key]) {
                const childMaxDepth = replaceComponentData({
                    parent: parent[key],
                    key: subKey,
                    components,
                    mapper,
                    depth: depth + 1,
                    maxDepth,
                    sumOfReplacing,
                });
                currentMaxDepth = Math.max(currentMaxDepth, childMaxDepth);
            }
        }
    }

    return currentMaxDepth;
}

export const prepareStoriesFromLocalFile = ({ from }: any) => {
    // Get all stories to be migrated
    const allLocalStories = discoverStories({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: [from],
    });

    // Get content of all stories to be migrated
    const storiesFileContent = getFilesContentWithRequire({
        files: allLocalStories,
    })[0];

    if (!storiesFileContent) {
        throw new Error(
            `Couldn't receive data from provided stories filename: ${chalk.red(
                from
            )}`
        );
    }

    return storiesFileContent;
};

export const prepareMigrationConfig = ({ migrationConfig }: any) => {
    // Get migration config file with migration definition
    const migrationConfigFiles = discoverMigrationConfig({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: [migrationConfig],
    });

    // Get content of migration config file
    const migrationConfigFileContent = getFilesContentWithRequire({
        files: migrationConfigFiles,
    })[0];

    if (isObjectEmpty(migrationConfigFileContent)) {
        throw new Error(
            "Migration config file is empty. Please provide default exported config object with components map to migrate"
        );
    }

    if (!migrationConfigFileContent) {
        throw new Error("Migration config probably doesnt exist. Create one");
    }

    Logger.success(`Migration config loaded.`);

    return migrationConfigFileContent;
};

export const migrateAllComponentsDataInStories = async (
    {
        itemType,
        migrationConfig,
        migrateFrom,
        from,
        to,
    }: Omit<MigrateItems, "componentsToMigrate">,
    config: RequestBaseConfig
) => {
    Logger.warning(
        `Trying to migrate all ${itemType} from ${migrateFrom}, ${from} to ${to}...`
    );

    const migrationConfigFileContent = prepareMigrationConfig({
        migrationConfig,
    });

    // Taking every component defined in const config = {} in migration config file
    const componentsToMigrate = Object.keys(migrationConfigFileContent);

    if (storyblokConfig.debug) {
        Logger.warning(
            "_________ Components in stories to migrate ___________"
        );
        console.log(componentsToMigrate);
    }

    await migrateProvidedComponentsDataInStories(
        {
            itemType,
            migrationConfig,
            migrateFrom,
            from,
            to,
            componentsToMigrate,
        },
        config
    );
};

export const doTheMigration = async (
    {
        itemType = "story",
        from,
        itemsToMigrate,
        componentsToMigrate,
        migrationConfigFileContent,
        migrationConfig,
        to,
    }: any,
    config: RequestBaseConfig
) => {
    const arrayOfMaxDepths: number[] = [];

    const migratedItems = itemsToMigrate.map((item: any, index: number) => {
        const sumOfReplacing: any = {};

        if (storyblokConfig.debug) {
            Logger.success(`#   ${index}   #`);
        }

        const json =
            itemType === "story" ? item[itemType].content : item[itemType];
        const maxDepth = replaceComponentData({
            parent: { root: json },
            key: "root",
            components: componentsToMigrate,
            mapper: migrationConfigFileContent,
            depth: 0,
            maxDepth: 0,
            sumOfReplacing,
        });

        arrayOfMaxDepths.push(maxDepth);

        if (Object.keys(sumOfReplacing).length > 0) {
            console.log("  ");
            console.log(
                `Migration in ${chalk.magenta(
                    itemType === "story"
                        ? item[itemType].full_slug
                        : item[itemType].name
                )} page: `
            );
            componentsToMigrate.forEach((component: any) => {
                if (sumOfReplacing[component]) {
                    console.log(
                        `${chalk.blue(
                            component
                        )} component data was replaced: ${
                            sumOfReplacing[component]
                        } times.`
                    );
                }
            });
        }

        if (Object.keys(sumOfReplacing).length > 0) {
            return {
                ...item,
                [itemType]:
                    itemType === "story"
                        ? {
                              ...item[itemType],
                              content: json,
                          }
                        : {
                              ...json,
                          },
            };
        } else {
            return null;
        }
    });

    const maxDepth = Math.max(...arrayOfMaxDepths);

    if (storyblokConfig.debug) {
        console.log(" ");
        if (maxDepth > 30) {
            Logger.error(`Max depth: ${maxDepth}`);
        } else {
            Logger.success(`Max depth: ${maxDepth}`);
        }
        console.log(" ");
    }

    const isListEmpty = (list: any[]) => list.filter((item) => item).length;

    if (!isListEmpty(migratedItems)) {
        console.log("# No Stories to update #");
    } else {
        console.log(`${migratedItems.length} stories to migrate`);
    }

    // Saving result with migrated version of stories into file
    await createAndSaveToFile({
        ext: "cjs",
        filename: `${from}---migrated`,
        folder: "migrations",
        res: migratedItems.filter((item: any) => item),
    });

    await modifyOrCreateAppliedMigrationsFile(migrationConfig);

    if (itemType === "story") {
        await managementApi.stories.updateStories(
            {
                stories: migratedItems.filter((item: any) => item),
                spaceId: to,
                options: { publish: false },
            },
            config
        );
    } else if (itemType === "preset") {
        const notNulMigratedItems = migratedItems.filter((item: any) => item);
        await managementApi.presets.updatePresets(
            {
                presets: notNulMigratedItems,
                spaceId: to,
                options: {},
            },
            config
        );
    }
};

type SaveBackupStoriesToFile = ({
    filename,
    folder,
    res,
}: {
    filename: string;
    folder: string;
    res: any;
}) => Promise<void>;

const saveBackupStoriesToFile: SaveBackupStoriesToFile = async ({
    res,
    folder,
    filename,
}) => {
    await createAndSaveToFile({
        ext: "json",
        datestamp: true,
        suffix: ".sb.stories",
        filename,
        folder,
        res: res,
    });
};

export const migrateProvidedComponentsDataInStories = async (
    {
        itemType,
        migrationConfig,
        migrateFrom,
        from,
        to,
        componentsToMigrate,
    }: MigrateItems,
    config: RequestBaseConfig
) => {
    const migrationConfigFileContent = prepareMigrationConfig({
        migrationConfig,
    });

    if (migrateFrom === "file") {
        Logger.log("Migrating using file....");

        // Get all stories to be migrated from file
        const itemsToMigrate = prepareStoriesFromLocalFile({ from });
        await doTheMigration(
            {
                itemsToMigrate,
                componentsToMigrate,
                migrationConfigFileContent,
                to,
            },
            config
        );
    } else if (migrateFrom === "space") {
        // Get all stories to be migrated from storyblok space
        let itemsToMigrate: any[] = [];
        if (itemType === "story") {
            itemsToMigrate = await managementApi.stories.getAllStories({
                ...config,
                spaceId: from,
            });
        } else if (itemType === "preset") {
            itemsToMigrate = await managementApi.presets.getAllPresets({
                ...config,
                spaceId: from,
            });
        }

        const backupFolder = path.join("backup", "stories");

        // save stories to file as backup
        await saveBackupStoriesToFile({
            filename: `before__${migrationConfig}__${from}`,
            folder: backupFolder,
            res: itemsToMigrate,
        });

        await doTheMigration(
            {
                itemType,
                itemsToMigrate,
                componentsToMigrate,
                migrationConfigFileContent,
                migrationConfig,
                from,
                to,
            },
            config
        );
    }
};
