/**
 * Output a program can rely on.
 *
 * With `--json` a command writes exactly one JSON document to stdout and
 * nothing else: every log line, whoever prints it, goes to stderr. Without
 * it the logs stay where they are and a short summary closes the run. Both
 * end the same way: any error sets exit code 1.
 */

import type { DestructiveChange } from "../../api/sync/sync-plan.js";
import type { SyncError, SyncResult } from "../../api/sync/sync.types.js";

import Logger from "../../utils/logger.js";

export type ReportError = {
    scope: string;
    name?: string;
    message: string;
};

export type CommandReport = {
    ok: boolean;
    command: string;
    errors: ReportError[];
    [key: string]: unknown;
};

export type SyncReport = CommandReport & {
    dryRun: boolean;
    components: Record<string, unknown>[];
    datasources: Record<string, unknown>[];
    destructive: DestructiveChange[];
};

let writeToStdout: ((chunk: string) => void) | undefined;
let documentWritten = false;

export const isJsonMode = (): boolean => writeToStdout !== undefined;

/**
 * From here on stdout belongs to the JSON document. Everything else that
 * writes to it — Logger, a stray `console.log`, a dependency — lands on
 * stderr. Call it before the command's modules load: loading the config
 * already logs.
 */
export const startJsonMode = (): void => {
    if (writeToStdout) return;

    const stdout = process.stdout;
    const write = stdout.write.bind(stdout);

    writeToStdout = (chunk) => {
        write(chunk);
    };
    stdout.write = process.stderr.write.bind(
        process.stderr,
    ) as typeof stdout.write;
};

const writeJsonDocument = (report: CommandReport): void => {
    if (documentWritten) return;
    documentWritten = true;

    const write =
        writeToStdout ?? ((chunk: string) => process.stdout.write(chunk));
    write(`${JSON.stringify(report, null, 2)}\n`);
};

export const messageOf = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
};

const toReportError = (error: SyncError): ReportError => ({
    scope: error.scope ?? "sync",
    ...(error.name !== undefined ? { name: error.name } : {}),
    message: error.message,
});

export const emptySyncReport = (
    command: string,
    dryRun: boolean,
): SyncReport => ({
    ok: true,
    command,
    dryRun,
    components: [],
    datasources: [],
    destructive: [],
    errors: [],
});

/**
 * One report for one sync command, from the results of every step it ran.
 * In a real run each component and datasource says whether it was written.
 */
export const buildSyncReport = ({
    command,
    dryRun,
    results,
    errors = [],
}: {
    command: string;
    dryRun: boolean;
    results: SyncResult[];
    errors?: SyncError[];
}): SyncReport => {
    const allErrors = [...results.flatMap((r) => r.errors), ...errors];
    const failed = (scope: string) =>
        new Set(
            allErrors
                .filter((error) => error.scope === scope)
                .map((error) => error.name),
        );
    const failedComponents = failed("component");
    const failedDatasources = failed("datasource");

    const withStatus = <T extends { name: string }>(
        plan: T,
        failedNames: Set<string>,
    ) =>
        dryRun
            ? plan
            : {
                  ...plan,
                  status: failedNames.has(plan.name) ? "failed" : "written",
              };

    const report: SyncReport = {
        ...emptySyncReport(command, dryRun),
        components: results
            .flatMap((r) => r.plan?.components ?? [])
            .map((plan) => withStatus(plan, failedComponents)),
        datasources: results
            .flatMap((r) => r.plan?.datasources ?? [])
            .map((plan) => withStatus(plan, failedDatasources)),
        destructive: results.flatMap((r) => r.plan?.destructive ?? []),
        errors: allErrors.map(toReportError),
    };

    report.ok = report.errors.length === 0;
    return report;
};

const printSummary = (report: CommandReport): void => {
    const destructive = (report as Partial<SyncReport>).destructive ?? [];

    if (destructive.length > 0) {
        Logger.warning(
            `${destructive.length} destructive change${destructive.length === 1 ? "" : "s"}:`,
        );
        destructive.forEach((change) =>
            Logger.warning(`  [${change.kind}] ${change.message}`),
        );
    }

    if (report.errors.length > 0) {
        Logger.error(
            `${report.command} finished with ${report.errors.length} error${report.errors.length === 1 ? "" : "s"}:`,
        );
        report.errors.forEach((error) =>
            Logger.error(
                `  [${error.scope}]${error.name ? ` ${error.name}:` : ""} ${error.message}`,
            ),
        );
    }
};

/**
 * Run a command that produces a report, and finish it honestly: an error
 * anywhere sets exit code 1, and the report is the JSON document or, for a
 * person, a summary after the logs. `empty` is the report to fill in when
 * the command throws before it has one.
 */
export const reportCommand = async <T extends CommandReport>(
    { json, empty }: { json: boolean; empty: T },
    run: () => Promise<T>,
): Promise<T> => {
    let report: T;

    try {
        report = await run();
    } catch (error) {
        report = {
            ...empty,
            errors: [{ scope: "command", message: messageOf(error) }],
        };
    }

    report.ok = report.errors.length === 0;

    if (!report.ok) {
        process.exitCode = 1;
    }

    if (json) {
        writeJsonDocument(report);
    } else {
        printSummary(report);
    }

    return report;
};

/**
 * The last word when a command failed before it could report — its modules
 * did not load, say. Writes nothing if a document is already out.
 */
export const failJsonCommand = ({
    command,
    error,
    extra = {},
}: {
    command: string;
    error: unknown;
    extra?: Record<string, unknown>;
}): void => {
    process.exitCode = 1;
    writeJsonDocument({
        ok: false,
        command,
        ...extra,
        errors: [{ scope: "command", message: messageOf(error) }],
    });
};
