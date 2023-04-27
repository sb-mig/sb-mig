import chalk from "chalk";

import storyblokConfig from "../../config/config.js";
import {
    discoverMigrationConfig,
    discoverStories,
    LOOKUP_TYPE,
    SCOPE,
} from "../../utils/discover.js";
import { createAndSaveToStoriesFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { getFilesContentWithRequire, isObjectEmpty } from "../../utils/main.js";
import { getAllStories, updateStories, updateStory } from "../stories.js";

export type MigrateFrom = "file" | "space";

interface MigrateStories {
    from: string;
    to: string;
    migrateFrom: MigrateFrom;
    migrationConfig: string;
    componentsToMigrate: string[];
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
            const { content, citation, ...rest } = parent[key];
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

export const migrateAllComponentsDataInStories = async ({
    migrationConfig,
    migrateFrom,
    from,
    to,
}: Omit<MigrateStories, "componentsToMigrate">) => {
    Logger.warning(
        `Trying to migrate all stories from ${migrateFrom}, ${from} to ${to}...`
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

    await migrateProvidedComponentsDataInStories({
        migrationConfig,
        migrateFrom,
        from,
        to,
        componentsToMigrate,
    });
};

export const doTheMigration = async ({
    from,
    storiesToMigrate,
    componentsToMigrate,
    migrationConfigFileContent,
    to,
}: any) => {
    const arrayOfMaxDepths: number[] = [];

    const migratedStories = storiesToMigrate.map(
        (stories: any, index: number) => {
            const sumOfReplacing: any = {};

            if (storyblokConfig.debug) {
                Logger.success(`#   ${index}   #`);
            }

            const json = stories.story.content;
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
                        stories.story.full_slug
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

            return {
                ...stories,
                story: {
                    ...stories.story,
                    content: json,
                },
            };
        }
    );

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

    // Saving result with migrated version of stories into file
    await createAndSaveToStoriesFile({
        filename: from,
        suffix: "---migrated",
        folder: "migrations",
        res: migratedStories,
    });

    await updateStories({ stories: migratedStories, spaceId: to });
};

export const migrateProvidedComponentsDataInStories = async ({
    migrationConfig,
    migrateFrom,
    from,
    to,
    componentsToMigrate,
}: MigrateStories) => {
    const migrationConfigFileContent = prepareMigrationConfig({
        migrationConfig,
    });

    if (migrateFrom === "file") {
        Logger.log("Migrating using file....");

        // Get all stories to be migrated from file
        const storiesToMigrate = prepareStoriesFromLocalFile({ from });
        await doTheMigration({
            storiesToMigrate,
            componentsToMigrate,
            migrationConfigFileContent,
            to,
        });
    } else if (migrateFrom === "space") {
        // Get all stories to be migrated from storyblok space
        const storiesToMigrate = await getAllStories({ spaceId: from });
        await doTheMigration({
            storiesToMigrate,
            componentsToMigrate,
            migrationConfigFileContent,
            from,
            to,
        });
    }
};
