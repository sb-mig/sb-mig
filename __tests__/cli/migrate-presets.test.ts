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

/**
 * What `meow` actually hands the command. Every flag declared with `default:`
 * or `isMultiple: true` is present on every invocation, typed or not. Tests
 * that omit these do not exercise the routing the CLI really performs — that
 * is how the scoped form shipped dead in v6.5.0-beta.2 (GCTT-3879).
 */
const cliFlags = (overrides: Record<string, unknown>) => ({
    migrateFrom: "space",
    migration: [] as string[],
    migrationComponentAlias: [] as string[],
    migrationComponents: [] as string[],
    withSlug: [] as string[],
    dryRun: false,
    ...overrides,
});

const runMigratePresets = (flags: Record<string, unknown>) =>
    migrate({
        input: ["migrate", "presets"],
        flags: cliFlags(flags),
    } as any);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.migrateAllComponentsDataInStories.mockResolvedValue(undefined);
    mocks.migrateProvidedComponentsDataInStories.mockResolvedValue(undefined);
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

describe("migrate presets <component...> (scoped run)", () => {
    const runScoped = (components: string[], flags: Record<string, unknown>) =>
        migrate({
            input: ["migrate", "presets", ...components],
            flags: cliFlags(flags),
        } as any);

    it("scopes the migration to the provided component names", async () => {
        await runScoped(["text-block", "sb-section"], {
            from: "12345",
            to: "12345",
            migration: "migration-a",
            dryRun: true,
        });

        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).toHaveBeenCalledTimes(1);
        const [engineArgs] =
            mocks.migrateProvidedComponentsDataInStories.mock.calls[0];
        expect(engineArgs.itemType).toBe("preset");
        expect(engineArgs.componentsToMigrate).toEqual([
            "text-block",
            "sb-section",
        ]);
        expect(engineArgs.migrationConfig).toEqual(["migration-a"]);
        expect(engineArgs.from).toBe("12345");
        expect(engineArgs.to).toBe("12345");
        // Mirrors the stories scoped path: always a space run.
        expect(engineArgs.migrateFrom).toBe("space");
        expect(mocks.migrateAllComponentsDataInStories).not.toHaveBeenCalled();
    });

    it("supports multiple --migration values in a scoped run", async () => {
        await runScoped(["text-block"], {
            from: "12345",
            to: "12345",
            migration: ["migration-a", "migration-b"],
            dryRun: true,
        });

        const [engineArgs] =
            mocks.migrateProvidedComponentsDataInStories.mock.calls[0];
        expect(engineArgs.migrationConfig).toEqual([
            "migration-a",
            "migration-b",
        ]);
    });

    it("falls back to the migration's own component scope when none is named", async () => {
        await runScoped([], {
            from: "12345",
            to: "12345",
            migration: "migration-a",
            dryRun: true,
        });

        const [engineArgs] =
            mocks.migrateProvidedComponentsDataInStories.mock.calls[0];
        expect(engineArgs.componentsToMigrate).toEqual([]);
    });

    it("still routes --all through the all-components path", async () => {
        await runScoped([], {
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: "migration-a",
            dryRun: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).not.toHaveBeenCalled();
    });
});

describe("migrate presets backup", () => {
    it("does not run its own backup on a real space run — the engine owns it", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: "migration-a",
            yes: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
        const [engineArgs] =
            mocks.migrateAllComponentsDataInStories.mock.calls[0];
        expect(engineArgs.from).toBe("12345");

        // The old CLI-level backup pulled from apiConfig's default space and
        // wrote a second "presets-backup" file.
        expect(mocks.getAllPresets).not.toHaveBeenCalled();
        expect(mocks.createAndSaveToFile).not.toHaveBeenCalled();
    });

    it("hits no API on a --migrate-from file run", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "file",
            fromFilePath: "sbmig/presets/presets-backup.json",
            to: "12345",
            migration: "migration-a",
            yes: true,
        });

        expect(mocks.getAllPresets).not.toHaveBeenCalled();
        expect(mocks.createAndSaveToFile).not.toHaveBeenCalled();
    });

    it("hits no API on a dry run", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: "migration-a",
            dryRun: true,
        });

        expect(mocks.getAllPresets).not.toHaveBeenCalled();
        expect(mocks.createAndSaveToFile).not.toHaveBeenCalled();
    });
});

describe("migrate presets cross-space guard", () => {
    it("fails fast when --from and --to are different spaces", async () => {
        await expect(
            runMigratePresets({
                all: true,
                migrateFrom: "space",
                from: "12345",
                to: "67890",
                migration: "migration-a",
                yes: true,
            }),
        ).rejects.toThrow(
            "requires --from and --to to be the same Storyblok space (got 12345 → 67890)",
        );

        expect(mocks.migrateAllComponentsDataInStories).not.toHaveBeenCalled();
    });

    it("fails fast on a cross-space scoped run too", async () => {
        await expect(
            migrate({
                input: ["migrate", "presets", "text-block"],
                flags: cliFlags({
                    from: "12345",
                    to: "67890",
                    migration: "migration-a",
                    yes: true,
                }),
            } as any),
        ).rejects.toThrow("the same Storyblok space");

        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).not.toHaveBeenCalled();
    });

    it("guards dry runs as well, so the plan is never misleading", async () => {
        await expect(
            runMigratePresets({
                all: true,
                migrateFrom: "space",
                from: "12345",
                to: "67890",
                migration: "migration-a",
                dryRun: true,
            }),
        ).rejects.toThrow("the same Storyblok space");
    });

    it("leaves same-space runs alone", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: "migration-a",
            yes: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
    });

    it("does not block --migrate-from file runs, where 'from' is a file name", async () => {
        await runMigratePresets({
            all: true,
            migrateFrom: "file",
            fromFilePath: "sbmig/presets/presets-backup.json",
            to: "12345",
            migration: "migration-a",
            yes: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
        const [engineArgs] =
            mocks.migrateAllComponentsDataInStories.mock.calls[0];
        expect(engineArgs.from).toBe("presets-backup");
        expect(engineArgs.to).toBe("12345");
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
