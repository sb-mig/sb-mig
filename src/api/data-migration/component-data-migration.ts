import type { RequestBaseConfig } from "../utils/request.js";

import path from "path";

import chalk from "chalk";

import {
    discoverMigrationConfig,
    discoverStories,
    LOOKUP_TYPE,
    SCOPE,
} from "../../cli/utils/discover.js";
import storyblokConfig from "../../config/config.js";
import {
    createAndSaveToFile,
    getFileContentWithRequire,
    getFilesContentWithRequire,
} from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { modifyOrCreateAppliedMigrationsFile } from "../../utils/migrations.js";
import { isObjectEmpty } from "../../utils/object-utils.js";
import { managementApi } from "../managementApi.js";

import {
    discoverMigrationValidatorForMigrationFile,
    MigrationValidationFailedError,
    runPreparedMigrationValidator,
    type MigrationValidationIssue,
    type PreparedMigrationValidator,
} from "./migration-validation.js";

export type MigrateFrom = "file" | "space";

export interface PreparedMigrationConfig {
    migrationConfigName: string;
    migrationConfigPath: string;
    migrationConfigFileContent: Record<string, MapperDefinition>;
    componentsToMigrate: string[];
    validator: PreparedMigrationValidator | null;
}

export interface MigrationStepValidationReport {
    validatorId: string;
    validatorName: string;
    issueCount: number;
    sourcePath: string;
}

export interface MigrationStepReport {
    migrationConfig: string;
    touchedItems: number;
    totalComponentReplacements: number;
    replacementsByComponent: Record<string, number>;
    maxDepth: number;
    validation: MigrationStepValidationReport | null;
}

export interface MigrationPipelineResult {
    changedItems: any[];
    finalItems: any[];
    stepReports: MigrationStepReport[];
    totalItems: number;
}

interface MigrateItems {
    itemType: "story" | "preset";
    from: string;
    to: string;
    migrateFrom: MigrateFrom;
    migrationConfig: string | string[];
    componentsToMigrate?: string[];
    filters?: {
        withSlug?: string[];
        startsWith?: string;
    };
    dryRun?: boolean;
    fromFilePath?: string;
    fileName?: string;
    preparedMigrationConfigs?: PreparedMigrationConfig[];
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

export const normalizeMigrationConfigNames = (
    migrationConfig: string | string[],
): string[] => {
    if (Array.isArray(migrationConfig)) {
        return migrationConfig.filter((name) => Boolean(name));
    }

    if (typeof migrationConfig === "string" && migrationConfig.length > 0) {
        return [migrationConfig];
    }

    return [];
};

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
            const { data: dataToReplace, wasReplaced } = (
                mapper[parent[key].component] as MapperDefinition
            )(parent[key]);

            // Keep migration output authoritative so key removals stay removed.
            parent[key] = dataToReplace;

            if (storyblokConfig.debug) {
                console.log(
                    chalk.yellow(
                        `______________ In __________________________________________`,
                    ),
                );
                console.log(" ");
                console.log(
                    `   Data from ${chalk.blue(
                        dataToReplace.component,
                    )} component,\n   with _uid: ${chalk.blue(
                        dataToReplace._uid,
                    )} `,
                );
                console.log("Was it replaced? ", wasReplaced);
                console.log(
                    chalk.yellow(
                        `____________________________________________________________`,
                    ),
                );
                console.log(" ");
            }

            if (wasReplaced) {
                sumOfReplacing[dataToReplace.component] = sumOfReplacing[
                    dataToReplace.component
                ]
                    ? sumOfReplacing[dataToReplace.component] + 1
                    : 1;

                if (storyblokConfig.debug) {
                    console.log("Sum of replacing: ");
                    console.log(sumOfReplacing);
                }
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

export const prepareStoriesFromLocalFile = ({
    from,
    fromFilePath,
}: {
    from?: string;
    fromFilePath?: string;
}) => {
    if (fromFilePath) {
        const resolvedFilePath = path.isAbsolute(fromFilePath)
            ? fromFilePath
            : path.resolve(process.cwd(), fromFilePath);

        const fileContent = getFileContentWithRequire({
            file: resolvedFilePath,
        });

        if (!fileContent) {
            throw new Error(
                `Couldn't receive data from provided stories path: ${chalk.red(
                    fromFilePath,
                )}`,
            );
        }

        return fileContent;
    }

    if (!from) {
        throw new Error(
            "'from' is required for migrateFrom=file when fromFilePath is not provided.",
        );
    }

    // Legacy discovery-based mode for story fixture names.
    const allLocalStories = discoverStories({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: [from],
    });

    const storiesFileContent = getFilesContentWithRequire({
        files: allLocalStories,
    })[0];

    if (!storiesFileContent) {
        throw new Error(
            `Couldn't receive data from provided stories filename: ${chalk.red(
                from,
            )}`,
        );
    }

    return storiesFileContent;
};

export const prepareMigrationConfigs = ({
    migrationConfig,
    componentsToMigrate,
}: {
    migrationConfig: string | string[];
    componentsToMigrate?: string[];
}): PreparedMigrationConfig[] => {
    const migrationConfigNames = normalizeMigrationConfigNames(migrationConfig);

    if (migrationConfigNames.length === 0) {
        throw new Error(
            "Migration config is required. Pass at least one --migration value.",
        );
    }

    const prepared: PreparedMigrationConfig[] = migrationConfigNames.map(
        (migrationConfigName) => {
            const migrationConfigFiles = discoverMigrationConfig({
                scope: SCOPE.local,
                type: LOOKUP_TYPE.fileName,
                fileNames: [migrationConfigName],
            });

            const migrationConfigPath = migrationConfigFiles[0];

            if (!migrationConfigPath) {
                throw new Error(
                    `Migration config '${migrationConfigName}' probably doesnt exist. Create one`,
                );
            }

            const migrationConfigFileContent = getFileContentWithRequire({
                file: migrationConfigPath,
            }) as Record<string, MapperDefinition> | undefined;

            if (isObjectEmpty(migrationConfigFileContent)) {
                throw new Error(
                    `Migration config file '${migrationConfigName}' is empty. Please provide default exported config object with components map to migrate`,
                );
            }

            if (!migrationConfigFileContent) {
                throw new Error(
                    `Migration config '${migrationConfigName}' probably doesnt exist. Create one`,
                );
            }

            const validator = discoverMigrationValidatorForMigrationFile({
                migrationConfigName,
                migrationConfigPath,
            });

            if (!validator) {
                Logger.warning(
                    `[VALIDATION] No co-located validator found for migration '${migrationConfigName}'. Expected a sibling '*.validation.*' file.`,
                );
            }

            const resolvedComponentsToMigrate =
                componentsToMigrate && componentsToMigrate.length > 0
                    ? componentsToMigrate
                    : Object.keys(migrationConfigFileContent);

            return {
                migrationConfigName,
                migrationConfigPath,
                migrationConfigFileContent,
                componentsToMigrate: resolvedComponentsToMigrate,
                validator,
            };
        },
    );

    Logger.success(`Migration config loaded.`);

    return prepared;
};

export const prepareMigrationConfig = ({
    migrationConfig,
}: {
    migrationConfig: string;
}) => {
    const prepared = prepareMigrationConfigs({ migrationConfig });
    const firstPrepared = prepared[0];

    if (!firstPrepared) {
        throw new Error("Migration config is required.");
    }

    return firstPrepared.migrationConfigFileContent;
};

const deepClone = <T>(input: T): T => JSON.parse(JSON.stringify(input));

const sumValues = (obj: Record<string, number>): number =>
    Object.values(obj).reduce((sum, value) => sum + value, 0);

const sanitizeOutputFileBaseName = (value: string): string => {
    const sanitized = value
        .trim()
        .replace(/[\\/]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");

    return sanitized || "migration-output";
};

const resolveOutputFileBaseName = ({
    from,
    fileName,
}: {
    from: string;
    fileName?: string;
}): string => {
    if (typeof fileName === "string" && fileName.trim().length > 0) {
        return sanitizeOutputFileBaseName(fileName);
    }

    return sanitizeOutputFileBaseName(from);
};

const shouldUseDatestampForArtifacts = (fileName?: string): boolean =>
    !(typeof fileName === "string" && fileName.trim().length > 0);

const applySingleMigrationToItems = ({
    itemType,
    itemsToMigrate,
    preparedMigrationConfig,
}: {
    itemType: "story" | "preset";
    itemsToMigrate: any[];
    preparedMigrationConfig: PreparedMigrationConfig;
}): {
    updatedItems: any[];
    stepReport: MigrationStepReport;
} => {
    const arrayOfMaxDepths: number[] = [];
    const replacementsByComponent: Record<string, number> = {};

    let touchedItems = 0;

    const updatedItems = itemsToMigrate.map((item: any, index: number) => {
        const sumOfReplacing: Record<string, number> = {};

        if (storyblokConfig.debug) {
            Logger.success(`#   ${index}   #`);
        }

        let json =
            itemType === "story" ? item[itemType]?.content : item[itemType];

        const rootWrapper = { root: json };

        const maxDepth = replaceComponentData({
            parent: rootWrapper,
            key: "root",
            components: preparedMigrationConfig.componentsToMigrate,
            mapper: preparedMigrationConfig.migrationConfigFileContent,
            depth: 0,
            maxDepth: 0,
            sumOfReplacing,
        });

        json = rootWrapper.root;
        arrayOfMaxDepths.push(maxDepth);

        const didReplace = Object.keys(sumOfReplacing).length > 0;

        if (didReplace) {
            touchedItems += 1;
            Object.entries(sumOfReplacing).forEach(([component, count]) => {
                replacementsByComponent[component] =
                    (replacementsByComponent[component] || 0) + count;
            });

            console.log("  ");
            console.log(
                `Migration in ${chalk.magenta(
                    itemType === "story"
                        ? item[itemType]?.full_slug
                        : item[itemType]?.name,
                )} page: `,
            );
            preparedMigrationConfig.componentsToMigrate.forEach(
                (component: string) => {
                    if (sumOfReplacing[component]) {
                        console.log(
                            `${chalk.blue(
                                component,
                            )} component data was replaced: ${
                                sumOfReplacing[component]
                            } times.`,
                        );
                    }
                },
            );

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
        }

        return item;
    });

    const maxDepth =
        arrayOfMaxDepths.length > 0 ? Math.max(...arrayOfMaxDepths) : 0;

    if (storyblokConfig.debug) {
        console.log(" ");
        if (maxDepth > 30) {
            Logger.error(`Max depth: ${maxDepth}`);
        } else {
            Logger.success(`Max depth: ${maxDepth}`);
        }
        console.log(" ");
    }

    return {
        updatedItems,
        stepReport: {
            migrationConfig: preparedMigrationConfig.migrationConfigName,
            touchedItems,
            maxDepth,
            replacementsByComponent,
            totalComponentReplacements: sumValues(replacementsByComponent),
            validation: null,
        },
    };
};

export const runMigrationPipelineInMemory = ({
    itemType,
    itemsToMigrate,
    preparedMigrationConfigs,
}: {
    itemType: "story" | "preset";
    itemsToMigrate: any[];
    preparedMigrationConfigs: PreparedMigrationConfig[];
}): MigrationPipelineResult => {
    const originalItems = deepClone(itemsToMigrate);
    let workingItems = deepClone(itemsToMigrate);

    const stepReports: MigrationStepReport[] = [];

    for (const preparedMigrationConfig of preparedMigrationConfigs) {
        const { updatedItems, stepReport } = applySingleMigrationToItems({
            itemType,
            itemsToMigrate: workingItems,
            preparedMigrationConfig,
        });

        workingItems = updatedItems;

        if (preparedMigrationConfig.validator) {
            Logger.log(
                `[VALIDATION] Running '${preparedMigrationConfig.validator.id}' after migration '${preparedMigrationConfig.migrationConfigName}'...`,
            );

            const validationResult = runPreparedMigrationValidator({
                validator: preparedMigrationConfig.validator,
                data: workingItems,
                isDebug: storyblokConfig.debug,
            });

            stepReport.validation = {
                validatorId: preparedMigrationConfig.validator.id,
                validatorName: preparedMigrationConfig.validator.name,
                issueCount: validationResult.issueCount,
                sourcePath: preparedMigrationConfig.validator.sourcePath,
            };

            if (!validationResult.ok) {
                throw new MigrationValidationFailedError({
                    migrationConfig:
                        preparedMigrationConfig.migrationConfigName,
                    validatorId: preparedMigrationConfig.validator.id,
                    validatorName: preparedMigrationConfig.validator.name,
                    issueCount: validationResult.issueCount,
                    issues: validationResult.issues,
                });
            }

            Logger.success(
                `[VALIDATION] Passed '${preparedMigrationConfig.validator.id}' after migration '${preparedMigrationConfig.migrationConfigName}'.`,
            );
        }

        stepReports.push(stepReport);
    }

    const changedItems = workingItems.filter((item, index) => {
        const originalItem = originalItems[index];

        if (!originalItem) {
            return true;
        }

        return JSON.stringify(item) !== JSON.stringify(originalItem);
    });

    return {
        changedItems,
        finalItems: workingItems,
        stepReports,
        totalItems: workingItems.length,
    };
};

const savePipelineSummary = async (
    {
        artifactBaseName,
        useDatestamp,
        from,
        itemType,
        dryRun,
        migrateFrom,
        fromFilePath,
        pipelineResult,
    }: {
        artifactBaseName: string;
        useDatestamp: boolean;
        from: string;
        itemType: "story" | "preset";
        dryRun?: boolean;
        migrateFrom: MigrateFrom;
        fromFilePath?: string;
        pipelineResult: MigrationPipelineResult;
    },
    config: RequestBaseConfig,
) => {
    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${
                dryRun ? "dry-run--" : ""
            }${artifactBaseName}---${itemType}-migration-pipeline-summary`,
            folder: "migrations",
            res: {
                itemType,
                source: {
                    migrateFrom,
                    from,
                    fromFilePath: fromFilePath || null,
                },
                totalItems: pipelineResult.totalItems,
                totalChangedItems: pipelineResult.changedItems.length,
                steps: pipelineResult.stepReports,
            },
        },
        config,
    );
};

const saveDryRunDiffArtifacts = async (
    {
        artifactBaseName,
        useDatestamp,
        itemType,
        dryRun,
        inputItems,
        finalItems,
    }: {
        artifactBaseName: string;
        useDatestamp: boolean;
        itemType: "story" | "preset";
        dryRun?: boolean;
        inputItems: any[];
        finalItems: any[];
    },
    config: RequestBaseConfig,
) => {
    if (!dryRun) {
        return;
    }

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `dry-run--${artifactBaseName}---${itemType}-input-full`,
            folder: "migrations",
            res: inputItems,
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `dry-run--${artifactBaseName}---${itemType}-after-full`,
            folder: "migrations",
            res: finalItems,
        },
        config,
    );
};

const loadItemsToMigrate = async (
    {
        itemType,
        migrateFrom,
        from,
        filters,
        fromFilePath,
    }: {
        itemType: "story" | "preset";
        migrateFrom: MigrateFrom;
        from: string;
        filters?: {
            withSlug?: string[];
            startsWith?: string;
        };
        fromFilePath?: string;
    },
    config: RequestBaseConfig,
): Promise<any[]> => {
    if (migrateFrom === "file") {
        Logger.log("Migrating using file....");

        const itemsFromFile = prepareStoriesFromLocalFile({
            from,
            fromFilePath,
        });
        const normalized = Array.isArray(itemsFromFile)
            ? itemsFromFile
            : [itemsFromFile];

        if (itemType === "story") {
            return normalized.filter(
                (it: any) => !(it?.story?.is_folder === true),
            );
        }

        return normalized;
    }

    let itemsToMigrate: any[] = [];

    if (itemType === "story") {
        if (filters?.withSlug && filters.withSlug.length > 0) {
            const results = await Promise.all(
                filters.withSlug.map((slug) =>
                    managementApi.stories.getStoryBySlug(slug, {
                        ...config,
                        spaceId: from,
                    }),
                ),
            );
            itemsToMigrate = (results.filter(Boolean) as any[]).filter(
                (it: any) => !(it?.story?.is_folder === true),
            );
        } else if (filters?.startsWith) {
            itemsToMigrate = await managementApi.stories.getAllStories(
                { options: { starts_with: filters.startsWith } as any },
                {
                    ...config,
                    spaceId: from,
                },
            );
            itemsToMigrate = itemsToMigrate.filter(
                (it: any) => !(it?.story?.is_folder === true),
            );
        } else {
            itemsToMigrate = await managementApi.stories.getAllStories(
                {},
                {
                    ...config,
                    spaceId: from,
                },
            );
            itemsToMigrate = itemsToMigrate.filter(
                (it: any) => !(it?.story?.is_folder === true),
            );
        }

        return itemsToMigrate;
    }

    return managementApi.presets.getAllPresets({
        ...config,
        spaceId: from,
    });
};

export const migrateAllComponentsDataInStories = async (
    {
        itemType,
        migrationConfig,
        migrateFrom,
        from,
        to,
        filters,
        dryRun,
        fromFilePath,
        fileName,
    }: Omit<MigrateItems, "componentsToMigrate" | "preparedMigrationConfigs">,
    config: RequestBaseConfig,
) => {
    Logger.warning(
        `Trying to migrate all ${itemType} from ${migrateFrom}, ${from} to ${to}...`,
    );

    const preparedMigrationConfigs = prepareMigrationConfigs({
        migrationConfig,
    });

    if (storyblokConfig.debug) {
        Logger.warning(
            "_________ Components in stories to migrate ___________",
        );
        console.log(
            Array.from(
                new Set(
                    preparedMigrationConfigs.flatMap(
                        (preparedMigrationConfig) =>
                            preparedMigrationConfig.componentsToMigrate,
                    ),
                ),
            ),
        );
    }

    await migrateProvidedComponentsDataInStories(
        {
            itemType,
            migrationConfig,
            migrateFrom,
            from,
            to,
            filters,
            dryRun,
            fromFilePath,
            fileName,
            preparedMigrationConfigs,
        },
        config,
    );
};

export const doTheMigration = async (
    {
        itemType = "story",
        from,
        itemsToMigrate,
        migrationConfig,
        migrationConfigs,
        to,
        dryRun,
        migrateFrom,
        fromFilePath,
        fileName,
    }: {
        itemType?: "story" | "preset";
        from: string;
        itemsToMigrate: any[];
        migrationConfig?: string | string[];
        migrationConfigs?: PreparedMigrationConfig[];
        to: string;
        dryRun?: boolean;
        migrateFrom: MigrateFrom;
        fromFilePath?: string;
        fileName?: string;
    },
    config: RequestBaseConfig,
) => {
    const preparedMigrationConfigs =
        migrationConfigs ||
        prepareMigrationConfigs({
            migrationConfig: migrationConfig || [],
        });
    const artifactBaseName = resolveOutputFileBaseName({ from, fileName });
    const useDatestamp = shouldUseDatestampForArtifacts(fileName);

    let pipelineResult: MigrationPipelineResult;

    try {
        pipelineResult = runMigrationPipelineInMemory({
            itemType,
            itemsToMigrate,
            preparedMigrationConfigs,
        });
    } catch (error) {
        if (error instanceof MigrationValidationFailedError) {
            await createAndSaveToFile(
                {
                    datestamp: useDatestamp,
                    ext: "json",
                    filename: `${dryRun ? "dry-run--" : ""}${artifactBaseName}---${itemType}-validation-failed`,
                    folder: "migrations",
                    res: {
                        migrationConfig: error.migrationConfig,
                        validatorId: error.validatorId,
                        validatorName: error.validatorName,
                        issueCount: error.issueCount,
                        issues: error.issues,
                    },
                },
                config,
            );

            Logger.error(
                `[VALIDATION] Migration '${error.migrationConfig}' failed in step validator '${error.validatorId}' with ${error.issueCount} issue(s).`,
            );

            error.issues
                .slice(0, 20)
                .forEach((issue: MigrationValidationIssue) => {
                    const uid = issue.uid ? ` (_uid: ${issue.uid})` : "";
                    console.log(
                        `  ${issue.componentPath} -> ${issue.component}${uid}  ${issue.message}`,
                    );
                });

            if (error.issueCount > 20) {
                Logger.warning(
                    "[VALIDATION] Showing first 20 issues only. Full report saved to migrations folder.",
                );
            }
        }

        throw error;
    }

    if (pipelineResult.changedItems.length === 0) {
        console.log("# No Stories to update #");
    } else {
        console.log(`${pipelineResult.changedItems.length} stories to migrate`);
    }

    await saveDryRunDiffArtifacts(
        {
            artifactBaseName,
            useDatestamp,
            itemType,
            dryRun,
            inputItems: itemsToMigrate,
            finalItems: pipelineResult.finalItems,
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${dryRun ? "dry-run--" : ""}${artifactBaseName}---${itemType}-to-migrate`,
            folder: "migrations",
            res: pipelineResult.changedItems,
        },
        config,
    );

    await savePipelineSummary(
        {
            artifactBaseName,
            useDatestamp,
            from,
            itemType,
            dryRun,
            migrateFrom,
            fromFilePath,
            pipelineResult,
        },
        config,
    );

    if (dryRun) {
        console.log(" ");
        Logger.success(
            `[DRY RUN] Migration preview complete. ${pipelineResult.changedItems.length} ${itemType}(s) would be affected.`,
        );
        Logger.success(
            `[DRY RUN] No API changes were made. Review the saved migration file for details.`,
        );
        return;
    }

    for (const preparedMigrationConfig of preparedMigrationConfigs) {
        await modifyOrCreateAppliedMigrationsFile(
            preparedMigrationConfig.migrationConfigName,
            itemType,
        );
    }

    if (pipelineResult.changedItems.length === 0) {
        return;
    }

    if (itemType === "story") {
        await managementApi.stories.updateStories(
            {
                stories: pipelineResult.changedItems,
                spaceId: to,
                options: { publish: false },
            },
            config,
        );
    } else if (itemType === "preset") {
        await managementApi.presets.updatePresets(
            {
                presets: pipelineResult.changedItems,
                spaceId: to,
                options: {},
            },
            config,
        );
    }
};

type SaveBackupStoriesToFile = (
    args: {
        itemType: "story" | "preset";
        filename: string;
        folder: string;
        res: any;
    },
    config: RequestBaseConfig,
) => Promise<void>;

const saveBackupToFile: SaveBackupStoriesToFile = async (
    { itemType, res, folder, filename },
    config,
) => {
    await createAndSaveToFile(
        {
            ext: "json",
            datestamp: true,
            suffix: itemType === "story" ? ".sb.stories" : ".sb.presets",
            filename,
            folder,
            res: res,
        },
        config,
    );
};

export const migrateProvidedComponentsDataInStories = async (
    {
        itemType,
        migrationConfig,
        migrateFrom,
        from,
        to,
        componentsToMigrate,
        filters,
        dryRun,
        fromFilePath,
        fileName,
        preparedMigrationConfigs,
    }: MigrateItems,
    config: RequestBaseConfig,
) => {
    const resolvedMigrationConfigs =
        preparedMigrationConfigs ||
        prepareMigrationConfigs({
            migrationConfig,
            componentsToMigrate,
        });

    const itemsToMigrate = await loadItemsToMigrate(
        {
            itemType,
            migrateFrom,
            from,
            filters,
            fromFilePath,
        },
        config,
    );

    if (migrateFrom === "space" && !dryRun) {
        const backupFolder = path.join("backup", itemType);
        const migrationLabel = resolvedMigrationConfigs
            .map(
                (preparedMigrationConfig) =>
                    preparedMigrationConfig.migrationConfigName,
            )
            .join("__");

        await saveBackupToFile(
            {
                itemType,
                filename: `before__${migrationLabel}__${from}`,
                folder: backupFolder,
                res: itemsToMigrate,
            },
            config,
        );
    }

    await doTheMigration(
        {
            itemType,
            itemsToMigrate,
            migrationConfigs: resolvedMigrationConfigs,
            migrationConfig,
            from,
            to,
            dryRun,
            migrateFrom,
            fromFilePath,
            fileName,
        },
        config,
    );
};
