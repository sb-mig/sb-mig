import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    migrateAllComponentsDataInStories: vi.fn(),
    migrateProvidedComponentsDataInStories: vi.fn(),
    prepareContinueMigration: vi.fn(),
    backupStories: vi.fn(),
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "default-space",
        sbApi: {},
    },
}));

vi.mock("../../src/api/data-migration/component-data-migration.js", () => ({
    migrateAllComponentsDataInStories: mocks.migrateAllComponentsDataInStories,
    migrateProvidedComponentsDataInStories:
        mocks.migrateProvidedComponentsDataInStories,
    prepareContinueMigration: mocks.prepareContinueMigration,
}));

vi.mock("../../src/api/stories/backup.js", () => ({
    backupStories: mocks.backupStories,
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
 * or `isMultiple: true` is present on every invocation, typed or not —
 * confirmed by dumping the flags object from the built CLI. Tests that omit
 * these do not exercise the routing the CLI really performs (GCTT-3879).
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

const runMigrateContent = (
    components: string[],
    flags: Record<string, unknown>,
) =>
    migrate({
        input: ["migrate", "content", ...components],
        flags: cliFlags(flags),
    } as any);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.migrateAllComponentsDataInStories.mockResolvedValue(undefined);
    mocks.migrateProvidedComponentsDataInStories.mockResolvedValue(undefined);
    mocks.backupStories.mockResolvedValue(undefined);
});

describe("migrate content <component...> (scoped run)", () => {
    it("reaches the engine with the named components", async () => {
        await runMigrateContent(["my-component-1", "my-component-2"], {
            from: "12345",
            to: "12345",
            migration: ["migration-a"],
            dryRun: true,
        });

        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).toHaveBeenCalledTimes(1);
        const [engineArgs] =
            mocks.migrateProvidedComponentsDataInStories.mock.calls[0];
        expect(engineArgs.itemType).toBe("story");
        expect(engineArgs.componentsToMigrate).toEqual([
            "my-component-1",
            "my-component-2",
        ]);
        expect(engineArgs.migrationConfig).toEqual(["migration-a"]);
        expect(engineArgs.migrateFrom).toBe("space");
        expect(mocks.migrateAllComponentsDataInStories).not.toHaveBeenCalled();
    });

    it("is not defeated by the migrateFrom default meow always injects", async () => {
        // Regression for GCTT-3879: `migrateFrom` is present on every real
        // invocation, and the `empty` rule used to ignore it, which made this
        // whole command form unreachable from the built CLI.
        await runMigrateContent(["my-component-1"], {
            migrateFrom: "space",
            from: "12345",
            to: "12345",
            migration: ["migration-a"],
            dryRun: true,
        });

        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).toHaveBeenCalledTimes(1);
    });

    it("takes a story backup on a real scoped run", async () => {
        await runMigrateContent(["my-component-1"], {
            from: "12345",
            to: "12345",
            migration: ["migration-a"],
            yes: true,
        });

        expect(mocks.backupStories).toHaveBeenCalledTimes(1);
        const [backupArgs] = mocks.backupStories.mock.calls[0];
        expect(backupArgs.spaceId).toBe("12345");
    });

    it("rejects a cross-space scoped run under the default publication mode", async () => {
        await expect(
            runMigrateContent(["my-component-1"], {
                from: "12345",
                to: "67890",
                migration: ["migration-a"],
                dryRun: true,
            }),
        ).rejects.toThrow("preserve-layers");

        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).not.toHaveBeenCalled();
    });
});

describe("migrate content --all", () => {
    it("still routes through the all-components path", async () => {
        await runMigrateContent([], {
            all: true,
            from: "12345",
            to: "12345",
            migration: ["migration-a"],
            dryRun: true,
        });

        expect(mocks.migrateAllComponentsDataInStories).toHaveBeenCalledTimes(
            1,
        );
        expect(
            mocks.migrateProvidedComponentsDataInStories,
        ).not.toHaveBeenCalled();
    });

    it("requires at least one --migration value", async () => {
        await expect(
            runMigrateContent([], {
                all: true,
                from: "12345",
                to: "12345",
                dryRun: true,
            }),
        ).rejects.toThrow("Pass at least one --migration value");
    });
});
