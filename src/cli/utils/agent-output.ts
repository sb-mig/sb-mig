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
    /** The component or datasource a preset or entry belongs to. */
    parent?: string;
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
    ...(error.parent !== undefined ? { parent: error.parent } : {}),
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

    // An item failed when its own write failed, or a write that belongs to
    // it did: a component's preset, a datasource's entry (`parent`).
    const failedNames = (scope: string, childScope: string) => {
        const own = new Set(
            allErrors.filter((e) => e.scope === scope).map((e) => e.name),
        );
        const parents = new Set(
            allErrors
                .filter((e) => e.scope === childScope)
                .map((e) => e.parent),
        );
        return new Set([...own, ...parents]);
    };
    const failedComponents = failedNames("component", "preset");
    const failedDatasources = failedNames("datasource", "datasource-entry");

    // `recreated`: deleted and created again by --ssot, not updated in place.
    const withStatus = <T extends { name: string; recreated?: boolean }>(
        plan: T,
        failed: Set<string | undefined>,
    ) =>
        dryRun
            ? plan
            : {
                  ...plan,
                  status: failed.has(plan.name)
                      ? "failed"
                      : plan.recreated
                        ? "recreated"
                        : "written",
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
 * person, a summary after the logs.
 *
 * `partial` builds the report from whatever the command has done so far.
 * When the command throws, that report is the one printed, with the error
 * added: a failure after writes must never hide the writes.
 */
export const reportCommand = async <T extends CommandReport>(
    { json, partial }: { json: boolean; partial: () => T },
    run: () => Promise<T>,
): Promise<T> => {
    let report: T;

    try {
        report = await run();
    } catch (error) {
        const sofar = partial();
        report = {
            ...sofar,
            errors: [
                ...sofar.errors,
                { scope: "command", message: messageOf(error) },
            ],
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
    report,
    error,
}: {
    report: CommandReport;
    error: unknown;
}): void => {
    process.exitCode = 1;
    writeJsonDocument({
        ...report,
        ok: false,
        errors: [
            ...report.errors,
            { scope: "command", message: messageOf(error) },
        ],
    });
};

/**
 * Before a question in a command an agent may run: without a terminal on
 * stdin the read would wait forever on a pipe nobody writes to, and under
 * `--json` a program is reading, not a person. Fails with the flags to pass.
 */
export const assertCanPrompt = (question: string): void => {
    if (process.stdin.isTTY === true && !isJsonMode()) return;

    throw new Error(
        `Confirmation needed, but there is no interactive terminal to ask: "${question}" Re-run with --yes to confirm, or with --dry-run to only preview.`,
    );
};
