import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    migrateAllComponentsDataInStories: vi.fn(),
    migrateProvidedComponentsDataInStories: vi.fn(),
    prepareContinueMigration: vi.fn(),
    getAllPresets: vi.fn(),
    createAndSaveToFile: vi.fn(),
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "default-space",
        sbApi: {},
    },
}));

vi.mock("../../src/api/data-migration/component-data-migration.js", () => ({
    migrateAllComponentsDataInStories:
        mocks.migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories:
        mocks.migrateProvidedComponentsDataInStories,
    prepareContinueMigration: mocks.prepareContinueMigration,
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        presets: {
            getAllPresets: mocks.getAllPresets,
        },
    },
}));

vi.mock("../../src/utils/files.js", () => ({
    createAndSaveToFile: mocks.createAndSaveToFile,
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { migrate } from "../../src/cli/commands/migrate.js";

const runMigratePresets = (flags: Record<string, unknown>) =>
    migrate({
        input: ["migrate", "presets"],
        flags,
    } as any);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.migrateAllComponentsDataInStories.mockResolvedValue(undefined);
    mocks.getAllPresets.mockResolvedValue([]);
    mocks.createAndSaveToFile.mockResolvedValue(undefined);
});

describe("migrate presets --migration pipeline", () => {
    it("passes every --migration value to the engine, in order", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: ["migration-a", "migration-b"],
            dryRun: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
        const [engineArgs] =
            mocks.migrateAllComponentsDataInStories.mock.calls[0];
        expect(engineArgs.itemType).toBe("preset");
        expect(engineArgs.migrationConfig).toEqual([
            "migration-a",
            "migration-b",
        ]);
    });

    it("still passes a single --migration value as a one-step pipeline", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: "migration-a",
            dryRun: true,
        });

        const [engineArgs] =
            mocks.migrateAllComponentsDataInStories.mock.calls[0];
        expect(engineArgs.migrationConfig).toEqual(["migration-a"]);
    });

    it("requires at least one --migration value", async () => {
        await expect(
            runMigratePresets({
                all: true,
                migrateFrom: "space",
                from: "12345",
                to: "12345",
                dryRun: true,
            }),
        ).rejects.toThrow("Pass at least one --migration value");

        expect(mocks.migrateAllComponentsDataInStories).not.toHaveBeenCalled();
    });
});

describe("migrate presets publication flags", () => {
    it.each([
        ["publicationMode", "save-only"],
        ["publicationLanguages", "default"],
        ["languagePublishStatePath", "sbmig/state.json"],
    ])("rejects --%s", async (flag, value) => {
        await expect(
            runMigratePresets({
                all: true,
                migrateFrom: "space",
                from: "12345",
                to: "12345",
                migration: "migration-a",
                dryRun: true,
                [flag]: value,
            }),
        ).rejects.toThrow("only supported for 'migrate content'");

        expect(mocks.migrateAllComponentsDataInStories).not.toHaveBeenCalled();
    });
});
