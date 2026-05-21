import type { PublishLanguagesOption } from "../stories/stories.types.js";
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
import { loadLanguagePublishStateMap } from "../stories/language-publish-state.js";

import {
    buildPreMigrationBackupBaseName,
    resolveOutputFileBaseName,
    shouldUseDatestampForArtifacts,
} from "./file-naming.js";
import {
    extendMigrationMapperWithAliases,
    type MigrationComponentAliasesByMigration,
    type MigrationComponentOverridesByMigration,
    resolveMigrationComponentsToMigrate,
} from "./migration-component-scope.js";
import { saveMigrationRunLog } from "./migration-run-log.js";
import {
    discoverMigrationValidatorForMigrationFile,
    MigrationValidationFailedError,
    runPreparedMigrationValidator,
    type MigrationValidationIssue,
    type PreparedMigrationValidator,
} from "./migration-validation.js";
import {
    buildPublishedLayerContext,
    contentHash,
    type PublishedLayerContext,
    type PublishedLayerRecord,
} from "./published-layer.js";
import { summarizeMutationWriteResults } from "./write-summary.js";

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
    migrationComponentAliases?: MigrationComponentAliasesByMigration;
    migrationComponentOverrides?: MigrationComponentOverridesByMigration;
    filters?: {
        withSlug?: string[];
        startsWith?: string;
    };
    dryRun?: boolean;
    publish?: boolean;
    publishLanguages?: PublishLanguagesOption;
    preservePublishedLayer?: boolean;
    fromFilePath?: string;
    fileName?: string;
    languagePublishStatePath?: string;
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
    migrationComponentAliases,
    migrationComponentOverrides,
}: {
    migrationConfig: string | string[];
    componentsToMigrate?: string[];
    migrationComponentAliases?: MigrationComponentAliasesByMigration;
    migrationComponentOverrides?: MigrationComponentOverridesByMigration;
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

            const aliasedMigrationConfigFileContent =
                extendMigrationMapperWithAliases(
                    migrationConfigFileContent,
                    migrationComponentAliases?.[migrationConfigName],
                );

            const resolvedComponentsToMigrate =
                resolveMigrationComponentsToMigrate({
                    mapper: aliasedMigrationConfigFileContent,
                    migrationName: migrationConfigName,
                    globalComponentsToMigrate: componentsToMigrate,
                    perMigrationOverrides: migrationComponentOverrides,
                });

            return {
                migrationConfigName,
                migrationConfigPath,
                migrationConfigFileContent: aliasedMigrationConfigFileContent,
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
        const originalItem = itemsToMigrate[index];

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
        publish,
        publishLanguages,
        migrateFrom,
        fromFilePath,
        languagePublishStatePath,
        pipelineResult,
    }: {
        artifactBaseName: string;
        useDatestamp: boolean;
        from: string;
        itemType: "story" | "preset";
        dryRun?: boolean;
        publish?: boolean;
        publishLanguages?: PublishLanguagesOption;
        migrateFrom: MigrateFrom;
        fromFilePath?: string;
        languagePublishStatePath?: string;
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
                    languagePublishStatePath: languagePublishStatePath || null,
                },
                writeMode: itemType === "story" && publish ? "publish" : "save",
                publishLanguages:
                    itemType === "story" && publish
                        ? {
                              requested: publishLanguages,
                          }
                        : null,
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

const storyIdOf = (item: any): string => String(item?.story?.id ?? "");

const indexStoriesById = (items: any[]) =>
    new Map(items.map((item) => [storyIdOf(item), item]));

const buildPublishedLayerSummary = ({
    context,
    draftPipelineResult,
    publishedPipelineResult,
}: {
    context: PublishedLayerContext;
    draftPipelineResult: MigrationPipelineResult;
    publishedPipelineResult: MigrationPipelineResult | null;
}) => {
    const draftFinalById = indexStoriesById(draftPipelineResult.finalItems);
    const draftChangedById = indexStoriesById(draftPipelineResult.changedItems);
    const publishedFinalById = indexStoriesById(
        publishedPipelineResult?.finalItems ?? [],
    );
    const publishedChangedById = indexStoriesById(
        publishedPipelineResult?.changedItems ?? [],
    );
    const stories = context.records.map((record) => {
        const id = String(record.storyId);
        const draftAfter = draftFinalById.get(id);
        const publishedAfter = publishedFinalById.get(id);
        const draftChanged = draftChangedById.has(id);
        const publishedLayerChanged = publishedChangedById.has(id);
        const needsDualLayerWrite =
            record.state === "dirty-published" &&
            !record.missingPublishedLayer &&
            (draftChanged || publishedLayerChanged);

        return {
            id: record.storyId,
            name: record.name,
            full_slug: record.full_slug,
            state: record.state,
            missingPublishedLayer: record.missingPublishedLayer,
            selectedPublishedVersion: record.selectedPublishedVersion,
            fetchedVersionCount: record.fetchedVersionCount,
            fetchedVersionStatuses: record.fetchedVersionStatuses,
            draftCurrentContentHashBefore: record.draftCurrentContentHash,
            draftCurrentContentHashAfter: draftAfter?.story?.content
                ? contentHash(draftAfter.story.content)
                : null,
            publishedLayerContentHashBefore:
                record.selectedPublishedVersion?.contentHash ?? null,
            publishedLayerContentHashAfter: publishedAfter?.story?.content
                ? contentHash(publishedAfter.story.content)
                : null,
            draftChanged,
            publishedLayerChanged,
            shapeComparison: record.shapeComparison,
            plannedWriteOrder: needsDualLayerWrite
                ? [
                      "update migrated published layer",
                      "publish migrated published layer",
                      "restore migrated draft/current layer with publish:false",
                  ]
                : [],
        };
    });
    const countState = (state: string) =>
        context.records.filter((record) => record.state === state).length;

    return {
        counts: {
            totalSelectedStories: context.records.length,
            draftOnlyStories: countState("draft-only"),
            cleanPublishedStories: countState("clean-published"),
            dirtyPublishedStories: countState("dirty-published"),
            publishedUnknownStories: countState("published-unknown"),
            dirtyPublishedWithPublishedLayer:
                context.dirtyPublishedRecords.length -
                context.missingPublishedLayerRecords.length,
            dirtyPublishedMissingPublishedLayer:
                context.missingPublishedLayerRecords.length,
            draftCurrentStoriesChanged: draftPipelineResult.changedItems.length,
            publishedLayerStoriesChanged:
                publishedPipelineResult?.changedItems.length ?? 0,
        },
        stories,
        draftCurrentPipeline: {
            totalItems: draftPipelineResult.totalItems,
            totalChangedItems: draftPipelineResult.changedItems.length,
            steps: draftPipelineResult.stepReports,
        },
        publishedLayerPipeline: publishedPipelineResult
            ? {
                  totalItems: publishedPipelineResult.totalItems,
                  totalChangedItems:
                      publishedPipelineResult.changedItems.length,
                  steps: publishedPipelineResult.stepReports,
              }
            : null,
    };
};

const savePublishedLayerArtifacts = async (
    {
        artifactBaseName,
        useDatestamp,
        dryRun,
        context,
        draftInputItems,
        draftPipelineResult,
        publishedPipelineResult,
    }: {
        artifactBaseName: string;
        useDatestamp: boolean;
        dryRun?: boolean;
        context: PublishedLayerContext;
        draftInputItems: any[];
        draftPipelineResult: MigrationPipelineResult;
        publishedPipelineResult: MigrationPipelineResult | null;
    },
    config: RequestBaseConfig,
) => {
    const prefix = dryRun ? "dry-run--" : "";
    const summary = buildPublishedLayerSummary({
        context,
        draftPipelineResult,
        publishedPipelineResult,
    });

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${prefix}${artifactBaseName}---draft-current-input-full`,
            folder: "migrations",
            res: draftInputItems,
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${prefix}${artifactBaseName}---draft-current-after-full`,
            folder: "migrations",
            res: draftPipelineResult.finalItems,
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${prefix}${artifactBaseName}---published-layer-input-full`,
            folder: "migrations",
            res: context.publishedLayerInputItems,
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${prefix}${artifactBaseName}---published-layer-after-full`,
            folder: "migrations",
            res: publishedPipelineResult?.finalItems ?? [],
        },
        config,
    );

    await createAndSaveToFile(
        {
            datestamp: useDatestamp,
            ext: "json",
            filename: `${prefix}${artifactBaseName}---published-layer-summary`,
            folder: "migrations",
            res: summary,
        },
        config,
    );
};

const assertNoMissingPublishedLayers = (context: PublishedLayerContext) => {
    if (context.missingPublishedLayerRecords.length === 0) {
        return;
    }

    const slugs = context.missingPublishedLayerRecords
        .map((record) => record.full_slug || record.storyId)
        .join(", ");

    throw new Error(
        `Missing published Story Version for dirty published story/stories: ${slugs}`,
    );
};

const hasStoryChangedSinceRead = (sourceStory: any, currentStory: any) => {
    if (
        sourceStory.current_version_id !== undefined &&
        currentStory.current_version_id !== undefined
    ) {
        return (
            sourceStory.current_version_id !== currentStory.current_version_id
        );
    }

    if (sourceStory.updated_at && currentStory.updated_at) {
        return sourceStory.updated_at !== currentStory.updated_at;
    }

    return false;
};

const writeDirtyPublishedLayerStory = async (
    {
        record,
        draftFinalItem,
        draftChanged,
        publishedFinalItem,
        publishedLayerChanged,
        to,
        resolvedPublishLanguages,
    }: {
        record: PublishedLayerRecord;
        draftFinalItem: any;
        draftChanged: boolean;
        publishedFinalItem?: any;
        publishedLayerChanged: boolean;
        to: string;
        resolvedPublishLanguages?: string[];
    },
    config: RequestBaseConfig,
) => {
    const sourceStory = record.draftCurrentItem.story;
    const storyId = sourceStory.id;
    const current = await managementApi.stories.getStoryById(String(storyId), {
        ...config,
        spaceId: to,
    });
    const currentStory = current?.story;

    if (!currentStory) {
        return {
            ok: false,
            stage: "update" as const,
            id: storyId,
            name: sourceStory.name,
            slug: sourceStory.full_slug || sourceStory.slug,
            spaceId: to,
            response: "Could not re-fetch story before dual-layer write.",
        };
    }

    if (hasStoryChangedSinceRead(sourceStory, currentStory)) {
        return {
            ok: false,
            stage: "update" as const,
            id: storyId,
            name: sourceStory.name,
            slug: sourceStory.full_slug || sourceStory.slug,
            spaceId: to,
            response:
                "Story changed after migration input was read; refusing to overwrite draft/current layer.",
        };
    }

    if (!publishedLayerChanged) {
        if (!draftChanged) {
            return {
                ok: true,
                stage: "update" as const,
                id: storyId,
                name: sourceStory.name,
                slug: sourceStory.full_slug || sourceStory.slug,
                spaceId: to,
                response: "No dirty published layer changes were required.",
            };
        }

        return managementApi.stories.updateStory(
            draftFinalItem.story,
            String(storyId),
            { publish: false },
            { ...config, spaceId: to },
        );
    }

    if (!publishedFinalItem) {
        return {
            ok: false,
            stage: "update" as const,
            id: storyId,
            name: sourceStory.name,
            slug: sourceStory.full_slug || sourceStory.slug,
            spaceId: to,
            response: "Missing migrated published-layer payload.",
        };
    }

    const publishedUpdateResult = await managementApi.stories.updateStory(
        publishedFinalItem.story,
        String(storyId),
        { publish: !resolvedPublishLanguages },
        { ...config, spaceId: to },
    );

    if (!publishedUpdateResult?.ok) {
        return publishedUpdateResult;
    }

    let publishResult = {
        ...publishedUpdateResult,
        stage: "publish" as const,
    };

    if (resolvedPublishLanguages) {
        publishResult = await managementApi.stories.publishStoryLanguages(
            {
                storyId,
                story: publishedFinalItem.story,
                languages: resolvedPublishLanguages,
            },
            { ...config, spaceId: to },
        );
    }

    const restoreDraftResult = await managementApi.stories.updateStory(
        draftFinalItem.story,
        String(storyId),
        { publish: false },
        { ...config, spaceId: to },
    );

    if (!publishResult?.ok) {
        return {
            ...publishResult,
            draftRestore: restoreDraftResult,
        };
    }

    if (!restoreDraftResult?.ok) {
        return {
            ...restoreDraftResult,
            response:
                restoreDraftResult.response ||
                "Published layer was migrated, but draft/current restore failed.",
        };
    }

    return {
        ...publishResult,
        sourcePublishState: "published_with_unpublished_changes",
        publishSkippedReason: undefined,
        draftRestore: restoreDraftResult,
    };
};

const writeDirtyPublishedLayerStories = async (
    {
        context,
        draftPipelineResult,
        publishedPipelineResult,
        to,
        resolvedPublishLanguages,
    }: {
        context: PublishedLayerContext;
        draftPipelineResult: MigrationPipelineResult;
        publishedPipelineResult: MigrationPipelineResult;
        to: string;
        resolvedPublishLanguages?: string[];
    },
    config: RequestBaseConfig,
) => {
    const draftFinalById = indexStoriesById(draftPipelineResult.finalItems);
    const draftChangedById = indexStoriesById(draftPipelineResult.changedItems);
    const publishedFinalById = indexStoriesById(
        publishedPipelineResult.finalItems,
    );
    const publishedChangedById = indexStoriesById(
        publishedPipelineResult.changedItems,
    );
    const recordsToWrite = context.dirtyPublishedRecords.filter((record) => {
        const id = String(record.storyId);
        return draftChangedById.has(id) || publishedChangedById.has(id);
    });

    return Promise.allSettled(
        recordsToWrite.map((record) => {
            const id = String(record.storyId);

            return writeDirtyPublishedLayerStory(
                {
                    record,
                    draftFinalItem: draftFinalById.get(id),
                    draftChanged: draftChangedById.has(id),
                    publishedFinalItem: publishedFinalById.get(id),
                    publishedLayerChanged: publishedChangedById.has(id),
                    to,
                    resolvedPublishLanguages,
                },
                config,
            );
        }),
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
        publish,
        publishLanguages,
        preservePublishedLayer,
        fromFilePath,
        fileName,
        languagePublishStatePath,
        migrationComponentAliases,
        migrationComponentOverrides,
    }: Omit<MigrateItems, "componentsToMigrate" | "preparedMigrationConfigs">,
    config: RequestBaseConfig,
) => {
    Logger.warning(
        `Trying to migrate all ${itemType} from ${migrateFrom}, ${from} to ${to}...`,
    );

    const preparedMigrationConfigs = prepareMigrationConfigs({
        migrationConfig,
        migrationComponentAliases,
        migrationComponentOverrides,
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
            publish,
            publishLanguages,
            preservePublishedLayer,
            fromFilePath,
            fileName,
            languagePublishStatePath,
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
        publish,
        publishLanguages,
        migrateFrom,
        fromFilePath,
        fileName,
        languagePublishStatePath,
        preservePublishedLayer,
    }: {
        itemType?: "story" | "preset";
        from: string;
        itemsToMigrate: any[];
        migrationConfig?: string | string[];
        migrationConfigs?: PreparedMigrationConfig[];
        to: string;
        dryRun?: boolean;
        publish?: boolean;
        publishLanguages?: PublishLanguagesOption;
        migrateFrom: MigrateFrom;
        fromFilePath?: string;
        fileName?: string;
        languagePublishStatePath?: string;
        preservePublishedLayer?: boolean;
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
    let publishedLayerContext: PublishedLayerContext | undefined;
    let publishedLayerPipelineResult: MigrationPipelineResult | null = null;

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

    if (itemType === "story" && preservePublishedLayer) {
        publishedLayerContext = await buildPublishedLayerContext(
            {
                items: itemsToMigrate,
                from,
            },
            config,
        );

        publishedLayerPipelineResult = runMigrationPipelineInMemory({
            itemType,
            itemsToMigrate: publishedLayerContext.publishedLayerInputItems,
            preparedMigrationConfigs,
        });

        await savePublishedLayerArtifacts(
            {
                artifactBaseName,
                useDatestamp,
                dryRun,
                context: publishedLayerContext,
                draftInputItems: itemsToMigrate,
                draftPipelineResult: pipelineResult,
                publishedPipelineResult: publishedLayerPipelineResult,
            },
            config,
        );

        assertNoMissingPublishedLayers(publishedLayerContext);
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
            publish,
            publishLanguages,
            migrateFrom,
            fromFilePath,
            languagePublishStatePath,
            pipelineResult,
        },
        config,
    );

    if (dryRun) {
        console.log(" ");
        if (publishedLayerPipelineResult) {
            Logger.success(
                `[DRY RUN] Published-layer preview complete. ${publishedLayerPipelineResult.changedItems.length} published-layer story/stories would be affected.`,
            );
        }
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

    const publishedLayerChangedCount =
        publishedLayerPipelineResult?.changedItems.length ?? 0;

    if (
        pipelineResult.changedItems.length === 0 &&
        publishedLayerChangedCount === 0
    ) {
        return;
    }

    let writeResults: PromiseSettledResult<any>[] = [];
    let resolvedPublishLanguages: string[] | undefined;
    const languagePublishStateMap = languagePublishStatePath
        ? loadLanguagePublishStateMap(languagePublishStatePath)
        : undefined;

    if (itemType === "story") {
        if (publish && publishLanguages !== undefined) {
            resolvedPublishLanguages =
                await managementApi.stories.resolvePublishLanguageCodes(
                    publishLanguages,
                    {
                        ...config,
                        spaceId: to,
                    },
                );
        }

        if (preservePublishedLayer && publishedLayerContext) {
            const dirtyStoryIds = new Set(
                publishedLayerContext.dirtyPublishedRecords.map((record) =>
                    String(record.storyId),
                ),
            );
            const nonDirtyChangedItems = pipelineResult.changedItems.filter(
                (item) => !dirtyStoryIds.has(storyIdOf(item)),
            );
            const nonDirtyWriteResults =
                nonDirtyChangedItems.length > 0
                    ? await managementApi.stories.updateStories(
                          {
                              stories: nonDirtyChangedItems,
                              spaceId: to,
                              options: {
                                  publish: Boolean(publish),
                                  publishLanguages: resolvedPublishLanguages,
                                  preservePublishState: Boolean(publish),
                                  languagePublishStateMap,
                              },
                          },
                          config,
                      )
                    : [];
            const dirtyWriteResults = publishedLayerPipelineResult
                ? await writeDirtyPublishedLayerStories(
                      {
                          context: publishedLayerContext,
                          draftPipelineResult: pipelineResult,
                          publishedPipelineResult: publishedLayerPipelineResult,
                          to,
                          resolvedPublishLanguages,
                      },
                      config,
                  )
                : [];

            writeResults = [...nonDirtyWriteResults, ...dirtyWriteResults];
        } else {
            writeResults = await managementApi.stories.updateStories(
                {
                    stories: pipelineResult.changedItems,
                    spaceId: to,
                    options: {
                        publish: Boolean(publish),
                        publishLanguages: resolvedPublishLanguages,
                        preservePublishState: Boolean(publish),
                        languagePublishStateMap,
                    },
                },
                config,
            );
        }
    } else if (itemType === "preset") {
        writeResults = await managementApi.presets.updatePresets(
            {
                presets: pipelineResult.changedItems,
                spaceId: to,
                options: {},
            },
            config,
        );
    }

    const writeSummary = summarizeMutationWriteResults(writeResults);

    try {
        await saveMigrationRunLog(
            {
                artifactBaseName,
                useDatestamp,
                from,
                to,
                itemType,
                dryRun,
                publish,
                publishLanguages,
                resolvedPublishLanguages,
                migrateFrom,
                fromFilePath,
                languagePublishStatePath,
                pipelineResult,
                writeResults,
                writeSummary,
            },
            config,
        );
    } catch (error) {
        Logger.warning(
            `[MIGRATION] Could not write migration run log: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }

    if (writeSummary.failed === 0) {
        Logger.success(
            `[MIGRATION] Update complete. ${writeSummary.successful}/${writeSummary.total} ${itemType}(s) updated successfully.`,
        );
        return;
    }

    Logger.warning(
        `[MIGRATION] Update complete with partial failures. ${writeSummary.successful}/${writeSummary.total} ${itemType}(s) updated successfully, ${writeSummary.failed} failed.`,
    );

    writeSummary.failedItems.slice(0, 10).forEach((item) => {
        const label = item.slug || item.name || item.id || "unknown";
        Logger.error(`[MIGRATION] Failed ${itemType}: ${String(label)}`);
    });

    if (writeSummary.failedItems.length > 10) {
        Logger.warning(
            `[MIGRATION] Showing first 10 failed ${itemType}(s) only.`,
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
        publish,
        publishLanguages,
        preservePublishedLayer,
        fromFilePath,
        fileName,
        languagePublishStatePath,
        preparedMigrationConfigs,
        migrationComponentAliases,
        migrationComponentOverrides,
    }: MigrateItems,
    config: RequestBaseConfig,
) => {
    const resolvedMigrationConfigs =
        preparedMigrationConfigs ||
        prepareMigrationConfigs({
            migrationConfig,
            componentsToMigrate,
            migrationComponentAliases,
            migrationComponentOverrides,
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

        await saveBackupToFile(
            {
                itemType,
                filename: buildPreMigrationBackupBaseName({
                    from,
                    fileName,
                }),
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
            publish,
            publishLanguages,
            preservePublishedLayer,
            migrateFrom,
            fromFilePath,
            fileName,
            languagePublishStatePath,
        },
        config,
    );
};
