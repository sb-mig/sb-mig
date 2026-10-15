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

    it("refuses to ask and names the flag to pass", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: undefined,
            configurable: true,
        });
        vi.resetModules();
        const { askForConfirmation } = await import("../../src/cli/helpers.js");
        const yes = vi.fn();
        const no = vi.fn();

        await expect(
            askForConfirmation("Delete everything?", yes, no, undefined),
        ).rejects.toThrow(/no interactive terminal.*--yes.*--dry-run/);
        expect(yes).not.toHaveBeenCalled();
        expect(no).not.toHaveBeenCalled();
    });

    it("still goes ahead with --yes", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: undefined,
            configurable: true,
        });
        vi.resetModules();
        const { askForConfirmation } = await import("../../src/cli/helpers.js");
        const yes = vi.fn();

        await askForConfirmation("Delete everything?", yes, vi.fn(), true);

        expect(yes).toHaveBeenCalledTimes(1);
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
