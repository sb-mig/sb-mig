import type {
    MigrateFrom,
    MigrationPipelineResult,
} from "./component-data-migration.js";
import type {
    MutationWriteResult,
    MutationWriteSummary,
} from "./write-summary.js";
import type { PublishLanguagesOption } from "../stories/stories.types.js";
import type { RequestBaseConfig } from "../utils/request.js";

import { generateDatestamp } from "../../utils/date-utils.js";
import { createDir, createJsonFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

type MigrationRunLogEvent =
    | "update_success"
    | "update_failed"
    | "publish_success"
    | "publish_failed"
    | "migration_write_summary";

export interface MigrationRunLogRecord {
    timestamp: string;
    event: MigrationRunLogEvent;
    runId: string;
    itemType: "story" | "preset";
    source: {
        migrateFrom: MigrateFrom;
        from: string;
        fromFilePath: string | null;
    };
    target: {
        to: string;
    };
    writeMode: "publish" | "save";
    publishLanguages?: {
        requested?: PublishLanguagesOption;
        resolved?: string[];
    };
    dryRun: boolean;
    migrationConfigs: string[];
    totalItems: number;
    totalChangedItems: number;
    writeSummary?: {
        total: number;
        successful: number;
        failed: number;
        failedItems: Array<{
            id?: number | string;
            name?: string;
            slug?: string;
            spaceId?: string;
            status?: number | string;
            response?: string | null;
            stage?: "update" | "publish";
        }>;
    };
    item?: {
        index: number;
        id?: number | string;
        name?: string;
        slug?: string;
        spaceId?: string;
    };
    status?: number | string | null;
    response?: string | null;
    stage?: "update" | "publish";
    error?: unknown;
}

interface SaveMigrationRunLogArgs {
    artifactBaseName: string;
    useDatestamp: boolean;
    from: string;
    to: string;
    itemType: "story" | "preset";
    dryRun?: boolean;
    publish?: boolean;
    publishLanguages?: PublishLanguagesOption;
    resolvedPublishLanguages?: string[];
    migrateFrom: MigrateFrom;
    fromFilePath?: string;
    pipelineResult: MigrationPipelineResult;
    writeResults: PromiseSettledResult<MutationWriteResult>[];
    writeSummary: MutationWriteSummary;
}

const serializeError = (error: unknown): unknown => {
    if (!error) {
        return null;
    }

    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    try {
        return JSON.parse(JSON.stringify(error));
    } catch {
        return String(error);
    }
};

const resolveChangedItemPayload = (item: any) => item?.story || item;

const resolveWriteResultValue = (
    result: PromiseSettledResult<MutationWriteResult>,
): MutationWriteResult => {
    if (result.status === "fulfilled") {
        return (
            result.value || {
                ok: false,
            }
        );
    }

    return {
        ok: false,
        error: result.reason,
    };
};

export const buildMigrationRunLogRecords = ({
    from,
    to,
    itemType,
    dryRun,
    publish,
    publishLanguages,
    resolvedPublishLanguages,
    migrateFrom,
    fromFilePath,
    pipelineResult,
    writeResults,
    writeSummary,
}: Omit<SaveMigrationRunLogArgs, "artifactBaseName" | "useDatestamp">) => {
    const timestamp = new Date().toISOString();
    const runId = `${itemType}-${timestamp}`;
    const baseRecord = {
        timestamp,
        runId,
        itemType,
        source: {
            migrateFrom,
            from,
            fromFilePath: fromFilePath || null,
        },
        target: {
            to,
        },
        writeMode: itemType === "story" && publish ? "publish" : "save",
        ...(publish
            ? {
                  publishLanguages: {
                      requested: publishLanguages,
                      resolved: resolvedPublishLanguages,
                  },
              }
            : {}),
        dryRun: Boolean(dryRun),
        migrationConfigs: pipelineResult.stepReports.map(
            (step) => step.migrationConfig,
        ),
        totalItems: pipelineResult.totalItems,
        totalChangedItems: pipelineResult.changedItems.length,
    } satisfies Omit<MigrationRunLogRecord, "event">;

    const updateRecords: MigrationRunLogRecord[] = writeResults.map(
        (result, index) => {
            const value = resolveWriteResultValue(result);
            const changedItem = resolveChangedItemPayload(
                pipelineResult.changedItems[index],
            );
            const stage = value.stage || "update";
            const event: MigrationRunLogEvent = value.ok
                ? stage === "publish"
                    ? "publish_success"
                    : "update_success"
                : stage === "publish"
                  ? "publish_failed"
                  : "update_failed";

            return {
                ...baseRecord,
                event,
                item: {
                    index,
                    id: value.id || changedItem?.id,
                    name: value.name || changedItem?.name,
                    slug:
                        value.slug ||
                        changedItem?.full_slug ||
                        changedItem?.slug,
                    spaceId: value.spaceId || to,
                },
                status: value.status || null,
                response: value.response || null,
                stage,
                ...(value.ok ? {} : { error: serializeError(value.error) }),
            };
        },
    );

    const summaryRecord: MigrationRunLogRecord = {
        ...baseRecord,
        event: "migration_write_summary",
        writeSummary: {
            total: writeSummary.total,
            successful: writeSummary.successful,
            failed: writeSummary.failed,
            failedItems: writeSummary.failedItems.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                spaceId: item.spaceId,
                status: item.status,
                response: item.response || null,
                stage: item.stage,
            })),
        },
    };

    return [...updateRecords, summaryRecord];
};

export const recordsToJsonl = (records: MigrationRunLogRecord[]) =>
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;

export const saveMigrationRunLog = async (
    args: SaveMigrationRunLogArgs,
    config: RequestBaseConfig,
) => {
    const { sbmigWorkingDirectory } = config;
    const { artifactBaseName, useDatestamp, itemType, dryRun } = args;
    const timestamp = generateDatestamp(new Date());
    const finalFilename = `${dryRun ? "dry-run--" : ""}${artifactBaseName}---${itemType}-migration-run-log${
        useDatestamp ? `__${timestamp}` : ""
    }.jsonl`;
    const folderPath = `${sbmigWorkingDirectory}/migrations/`;
    const fullPath = `${folderPath}${finalFilename}`;
    const records = buildMigrationRunLogRecords(args);

    await createDir(folderPath);
    await createJsonFile(recordsToJsonl(records), fullPath);

    Logger.success(`Migration run log written to a file:  ${fullPath}`);
};
