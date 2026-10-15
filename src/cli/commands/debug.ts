import path from "path";

import config from "../../config/config.js";
import {
    getConsumerPackageJson,
    getSbMigPackageJson,
} from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { pkg } from "../../utils/pkg.js";
import { type CommandReport, reportCommand } from "../utils/agent-output.js";

const SECRET_KEY = /token|secret|password|api_?key/i;

/**
 * The config with every credential replaced. `debug` output ends up in issue
 * comments and agent transcripts; a token must never travel with it.
 */
export const redactConfig = (value: unknown, key = ""): unknown => {
    if (SECRET_KEY.test(key) && typeof value === "string") {
        return value === "" ? "" : "[redacted]";
    }

    if (typeof value === "function") return "[function]";

    if (Array.isArray(value)) {
        return value.map((item) => redactConfig(item));
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                redactConfig(entryValue, entryKey),
            ]),
        );
    }

    return value;
};

type DebugReport = CommandReport & {
    config: unknown;
    versions: Record<string, string | null>;
    moduleType: "module" | "commonjs" | null;
    /** What could not be read. Diagnostics, not failures: debug still exits 0. */
    warnings: string[];
};

const collectDebugReport = async (): Promise<DebugReport> => {
    const report: DebugReport = {
        ok: true,
        command: "debug",
        config: redactConfig(config),
        versions: {
            "sb-mig": null,
            "storyblok-js-client": null,
            typescript: null,
            "@ef-global/backpack": null,
        },
        moduleType: null,
        warnings: [],
        errors: [],
    };

    try {
        const fileContent = await getSbMigPackageJson();

        report.versions["sb-mig"] = fileContent["version"] ?? null;
        report.versions["storyblok-js-client"] =
            fileContent["dependencies"]?.["storyblok-js-client"] ?? null;
        report.versions["typescript"] =
            fileContent["dependencies"]?.["typescript"] ?? null;
    } catch {
        report.warnings.push("Can't read sb-mig's package.json.");
    }

    try {
        const consumerPkg = await getConsumerPackageJson();

        report.versions["@ef-global/backpack"] =
            consumerPkg["dependencies"]?.["@ef-global/backpack"] ?? null;
        report.moduleType =
            pkg(path.join(`${process.cwd()}`, `package.json`)).type === "module"
                ? "module"
                : "commonjs";
    } catch {
        report.warnings.push(`Can't read package.json in ${process.cwd()}.`);
    }

    return report;
};

const printDebugReport = (report: DebugReport) => {
    console.log("storyblok.config.js: ", report.config, "\n");
    Logger.log(" ");
    Logger.log("sb-mig version: ");
    Logger.success(report.versions["sb-mig"] ?? "unknown");
    Logger.log(" ");
    Logger.log("Version used: ");
    Logger.success(
        `storyblok-js-client: ${report.versions["storyblok-js-client"]}`,
    );
    Logger.success(`typescript: ${report.versions["typescript"]}`);
    Logger.success(
        `@ef-global/backpack: ${report.versions["@ef-global/backpack"]}`,
    );
    Logger.log(" ");

    if (report.moduleType === "module") {
        Logger.log("U are using new esm stuff. Good for you!");
    } else if (report.moduleType === "commonjs") {
        Logger.log("Oh, common, commonjs, really? (common....js got it ?)");
    }

    report.warnings.forEach((warning) => Logger.warning(warning));
};

export const debug = async ({ json = false }: { json?: boolean } = {}) => {
    const empty: DebugReport = {
        ok: false,
        command: "debug",
        config: null,
        versions: {},
        moduleType: null,
        warnings: [],
        errors: [],
    };

    await reportCommand({ json, empty }, async () => {
        const report = await collectDebugReport();
        if (!json) printDebugReport(report);
        return report;
    });
};
