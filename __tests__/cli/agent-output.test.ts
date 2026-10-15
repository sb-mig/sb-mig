import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    createMockApiConfig,
    createPaginatedResponse,
} from "../mocks/storyblokClient.mock.js";

/**
 * MAR-4104: `sync components` and `sync datasources` as an agent runs them.
 * The Storyblok client is mocked; everything between it and the command —
 * discovery, the sync, the report, the exit code — is the real code.
 */

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("../../src/config/config.js", () => ({
    default: {
        spaceId: "12345",
        oauthToken: "mock-token",
        debug: false,
        schemaFileExt: "sb.js",
    },
}));

const mockApiConfig = createMockApiConfig();

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: mockApiConfig,
}));

const localFiles: Record<string, any> = {
    "/project/src/hero.sb.js": { name: "hero", schema: {} },
    "/project/src/card.sb.js": { name: "card", schema: {} },
    "/project/src/promo.sb.js": { name: "promo", schema: {} },
};

vi.mock("../../src/cli/utils/discover.js", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    discover: vi.fn(async ({ scope }: { scope: string }) =>
        scope === "local" ? Object.keys(localFiles) : [],
    ),
    discoverResolvers: vi.fn(async () => []),
}));

vi.mock("../../src/utils/files.js", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getFileContentWithRequire: vi.fn(({ file }: { file: string }) =>
        structuredClone(localFiles[file]),
    ),
}));

const REPORT_KEYS = [
    "command",
    "components",
    "datasources",
    "destructive",
    "dryRun",
    "errors",
    "ok",
];

let stdout: string[];

/** A fresh module graph per test: the report module writes one document per run. */
const loadSync = async () => {
    vi.resetModules();
    return (await import("../../src/cli/commands/sync.js")).sync;
};

const jsonDocuments = () =>
    stdout
        .join("")
        .split(/\n(?=\{)/)
        .filter((chunk) => chunk.trim().startsWith("{"))
        .map((chunk) => JSON.parse(chunk));

describe("sync components --json", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.exitCode = undefined;
        stdout = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            stdout.push(String(chunk));
            return true;
        });

        mockApiConfig.sbApi.get.mockImplementation((path: string) =>
            Promise.resolve(
                path.includes("component_groups")
                    ? createPaginatedResponse([], "component_groups")
                    : createPaginatedResponse(
                          [
                              { id: 1, name: "hero", schema: {} },
                              { id: 2, name: "card", schema: {} },
                          ],
                          "components",
                      ),
            ),
        );
        mockApiConfig.sbApi.put.mockImplementation((_path: string, body: any) =>
            Promise.resolve({ data: { component: body.component } }),
        );
        mockApiConfig.sbApi.post.mockImplementation(
            (_path: string, body: any) =>
                Promise.resolve({
                    data: { component: { ...body.component, id: 3 } },
                }),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.exitCode = undefined;
    });

    it("prints one JSON document with the agreed shape, and exits 0", async () => {
        const sync = await loadSync();

        await sync({
            input: ["sync", "components"],
            flags: { all: true, dryRun: true, json: true },
        } as any);

        const documents = jsonDocuments();
        expect(documents).toHaveLength(1);

        const [report] = documents;
        expect(Object.keys(report).sort()).toEqual(REPORT_KEYS);
        expect(report).toMatchObject({
            ok: true,
            command: "sync components",
            dryRun: true,
            datasources: [],
            destructive: [],
            errors: [],
        });
        expect(report.components.map((c: any) => [c.name, c.action])).toEqual([
            ["hero", "unchanged"],
            ["card", "unchanged"],
            ["promo", "create"],
        ]);
        expect(process.exitCode).toBeUndefined();
        expect(mockApiConfig.sbApi.put).not.toHaveBeenCalled();
        expect(mockApiConfig.sbApi.post).not.toHaveBeenCalled();
    });

    it("exits 1 when one of three writes fails, after attempting all three", async () => {
        mockApiConfig.sbApi.put.mockImplementation(
            (_path: string, body: any) =>
                body.component.name === "card"
                    ? Promise.reject({
                          message: "Unprocessable",
                          status: 422,
                          response: { status: 422, data: { error: "refused" } },
                      })
                    : Promise.resolve({ data: { component: body.component } }),
        );
        const sync = await loadSync();

        await sync({
            input: ["sync", "components"],
            flags: { all: true, json: true },
        } as any);

        const [report] = jsonDocuments();
        expect(process.exitCode).toBe(1);
        expect(report.ok).toBe(false);
        expect(report.components.map((c: any) => [c.name, c.status])).toEqual([
            ["hero", "written"],
            ["card", "failed"],
            ["promo", "written"],
        ]);
        expect(report.errors).toEqual([
            {
                scope: "component",
                name: "card",
                message: expect.stringContaining("refused"),
            },
        ]);
        expect(mockApiConfig.sbApi.put).toHaveBeenCalledTimes(2);
        expect(mockApiConfig.sbApi.post).toHaveBeenCalledTimes(1);
    });

    it("keeps the written components in the report when a later step fails", async () => {
        let componentReads = 0;
        mockApiConfig.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("component_groups")) {
                return Promise.resolve(
                    createPaginatedResponse([], "component_groups"),
                );
            }
            // The second listing is the default-preset step, after the writes.
            return ++componentReads === 1
                ? Promise.resolve(
                      createPaginatedResponse(
                          [
                              { id: 1, name: "hero", schema: {} },
                              { id: 2, name: "card", schema: {} },
                          ],
                          "components",
                      ),
                  )
                : Promise.reject(new Error("listing is down"));
        });
        const sync = await loadSync();

        await sync({
            input: ["sync", "components"],
            flags: { all: true, presets: true, json: true },
        } as any);

        const [report] = jsonDocuments();
        expect(process.exitCode).toBe(1);
        expect(report.components.map((c: any) => [c.name, c.status])).toEqual([
            ["hero", "written"],
            ["card", "written"],
            ["promo", "written"],
        ]);
        expect(report.errors).toEqual([
            {
                scope: "default-preset",
                name: "(all components)",
                message: expect.stringContaining("listing is down"),
            },
        ]);
    });

    it("turns a flag combination nothing handles into an error, not a quiet success", async () => {
        const sync = await loadSync();

        await sync({
            input: ["sync", "components"],
            flags: { all: true, dryrun: true, json: true },
        } as any);

        const [report] = jsonDocuments();
        expect(process.exitCode).toBe(1);
        expect(report.errors[0].message).toContain("--dryrun");
        expect(mockApiConfig.sbApi.get).not.toHaveBeenCalled();
    });

    it("prints a failure summary and exits 1 without --json too", async () => {
        mockApiConfig.sbApi.post.mockRejectedValue(new Error("promo refused"));
        const sync = await loadSync();
        const Logger = (await import("../../src/utils/logger.js")).default;

        await sync({
            input: ["sync", "components"],
            flags: { all: true },
        } as any);

        expect(jsonDocuments()).toHaveLength(0);
        expect(process.exitCode).toBe(1);
        expect(Logger.error).toHaveBeenCalledWith(
            "sync components finished with 1 error:",
        );
        expect(Logger.error).toHaveBeenCalledWith(
            "  [component] promo: promo refused",
        );
    });
});

describe("prompts without a terminal", () => {
    const original = process.stdin.isTTY;

    afterEach(() => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: original,
            configurable: true,
        });
    });

    it("refuses to ask without a terminal, and names the flag to pass", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: undefined,
            configurable: true,
        });
        vi.resetModules();
        const { assertCanPrompt } =
            await import("../../src/cli/utils/agent-output.js");

        expect(() => assertCanPrompt("Delete everything?")).toThrow(
            /no interactive terminal.*--yes.*--dry-run/,
        );
    });

    it("lets a terminal answer", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: true,
            configurable: true,
        });
        vi.resetModules();
        const { assertCanPrompt } =
            await import("../../src/cli/utils/agent-output.js");

        expect(() => assertCanPrompt("Delete everything?")).not.toThrow();
    });

    it("leaves the shared prompt alone: other commands still take piped answers", async () => {
        const helpers = await import("node:fs").then((fs) =>
            fs.readFileSync("src/cli/helpers.ts", "utf8"),
        );

        // migrate, revert and sync content confirm through askForConfirmation;
        // `echo y | sb-mig ...` must keep working there (MAR-4104 review).
        expect(helpers).not.toContain("isTTY");
        expect(helpers).not.toContain("assertCanPrompt");
    });

    it("fails sync components --ssot with exit code 1 instead of waiting", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: undefined,
            configurable: true,
        });
        stdout = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            stdout.push(String(chunk));
            return true;
        });
        const sync = await loadSync();

        await sync({
            input: ["sync", "components"],
            flags: { all: true, ssot: true, json: true },
        } as any);

        const [report] = jsonDocuments();
        expect(process.exitCode).toBe(1);
        expect(report.errors[0].message).toContain("--yes");
        expect(mockApiConfig.sbApi.delete).not.toHaveBeenCalled();
        vi.restoreAllMocks();
        process.exitCode = undefined;
    });
});

describe("report shape", () => {
    it("gives an early failure the full shape", async () => {
        vi.resetModules();
        const { emptySyncReport, failJsonCommand } =
            await import("../../src/cli/utils/agent-output.js");
        const written: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            written.push(String(chunk));
            return true;
        });

        failJsonCommand({
            report: emptySyncReport("sync components", true),
            error: new Error("config is broken"),
        });

        const report = JSON.parse(written.join(""));
        expect(Object.keys(report).sort()).toEqual(REPORT_KEYS);
        expect(report).toMatchObject({
            ok: false,
            dryRun: true,
            components: [],
            errors: [{ scope: "command", message: "config is broken" }],
        });
        vi.restoreAllMocks();
        process.exitCode = undefined;
    });

    it("marks a datasource with a failed entry, and a component with a failed preset, as failed", async () => {
        const { buildSyncReport } =
            await import("../../src/cli/utils/agent-output.js");
        const plan = (name: string) => ({ name, action: "update" });

        const report = buildSyncReport({
            command: "sync",
            dryRun: false,
            results: [
                {
                    created: [],
                    updated: ["hero", "card"],
                    skipped: [],
                    errors: [
                        { scope: "preset", name: "hero/Default", message: "x" },
                    ],
                    plan: {
                        components: [plan("hero"), plan("card")] as any,
                    },
                },
                {
                    created: [],
                    updated: ["colors", "sizes"],
                    skipped: [],
                    errors: [
                        {
                            scope: "datasource-entry",
                            name: "colors/red",
                            message: "x",
                        },
                    ],
                    plan: {
                        datasources: [plan("colors"), plan("sizes")] as any,
                    },
                },
            ],
        });

        expect(
            [...report.components, ...report.datasources].map((item: any) => [
                item.name,
                item.status,
            ]),
        ).toEqual([
            ["hero", "failed"],
            ["card", "written"],
            ["colors", "failed"],
            ["sizes", "written"],
        ]);
    });
});
