import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    modifyAppliedMigrationsMock,
    saveMigrationRunLogMock,
    loggerMock,
    updatePresetsMock,
    getAllPresetsMock,
    updateStoriesMock,
    resolvePublishLanguageCodesMock,
} = vi.hoisted(() => ({
    modifyAppliedMigrationsMock: vi.fn(),
    saveMigrationRunLogMock: vi.fn(),
    loggerMock: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
    updatePresetsMock: vi.fn(),
    getAllPresetsMock: vi.fn(),
    updateStoriesMock: vi.fn(),
    resolvePublishLanguageCodesMock: vi.fn(),
}));

// NOTE: files.js is intentionally NOT mocked — the dry-run → continue round trip
// relies on real disk IO (write artifacts in a temp dir, then read them back).
vi.mock("../../src/utils/migrations.js", () => ({
    modifyOrCreateAppliedMigrationsFile: modifyAppliedMigrationsMock,
}));

vi.mock("../../src/api/data-migration/migration-run-log.js", () => ({
    saveMigrationRunLog: saveMigrationRunLogMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: loggerMock,
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            updateStories: updateStoriesMock,
            resolvePublishLanguageCodes: resolvePublishLanguageCodesMock,
        },
        presets: {
            updatePresets: updatePresetsMock,
            getAllPresets: getAllPresetsMock,
        },
    },
}));

import {
    doTheMigration,
    migrateProvidedComponentsDataInStories,
    prepareContinueMigration,
    runMigrationPipelineInMemory,
    type PreparedMigrationConfig,
} from "../../src/api/data-migration/component-data-migration.js";
import { MigrationValidationFailedError } from "../../src/api/data-migration/migration-validation.js";

const markTargetMigration: PreparedMigrationConfig = {
    migrationConfigName: "mark-target",
    migrationConfigPath: "/test/mark-target.sb.migration.cjs",
    migrationConfigFileContent: {
        target: (data: any) => ({
            wasReplaced: true,
            data: { ...data, migrated: true },
        }),
    },
    componentsToMigrate: ["target"],
    validator: null,
};

const renameTargetMigration: PreparedMigrationConfig = {
    migrationConfigName: "rename-target",
    migrationConfigPath: "/test/rename-target.sb.migration.cjs",
    migrationConfigFileContent: {
        target: (data: any) => ({
            wasReplaced: true,
            data: { ...data, component: "target-v2" },
        }),
    },
    componentsToMigrate: ["target"],
    validator: null,
};

/**
 * The raw shape `managementApi.presets.getAllPresets` returns: the preset
 * envelope carries the metadata, `preset` carries the component data.
 */
const createPresetItem = () => ({
    id: 41,
    name: "Hero preset",
    component_id: 12,
    preset: {
        _uid: "preset-root",
        component: "target",
        text: "Hello",
    },
});

let tmpDir: string;
let config: any;

const migrationsDir = () => path.join(tmpDir, "migrations");
const readJson = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(migrationsDir(), file), "utf-8"));

beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sbmig-presets-"));
    fs.mkdirSync(migrationsDir(), { recursive: true });
    config = {
        spaceId: "space-1",
        sbmigWorkingDirectory: tmpDir,
        sbApi: {},
    };

    modifyAppliedMigrationsMock.mockResolvedValue(undefined);
    saveMigrationRunLogMock.mockResolvedValue(undefined);
    updatePresetsMock.mockResolvedValue([
        {
            status: "fulfilled",
            value: { ok: true, id: 41, name: "Hero preset" },
        },
    ]);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("preset migration pipeline (itemType: preset)", () => {
    it("migrates the preset data and keeps the preset envelope intact", () => {
        const result = runMigrationPipelineInMemory({
            itemType: "preset",
            itemsToMigrate: [createPresetItem()],
            preparedMigrationConfigs: [markTargetMigration],
        });

        expect(result.changedItems).toHaveLength(1);
        expect(result.totalItems).toBe(1);
        expect(result.finalItems[0]).toEqual({
            id: 41,
            name: "Hero preset",
            component_id: 12,
            preset: {
                _uid: "preset-root",
                component: "target",
                text: "Hello",
                migrated: true,
            },
        });
    });

    it("migrates components nested inside the preset data", () => {
        const nestedPreset = {
            id: 42,
            name: "Section preset",
            component_id: 13,
            preset: {
                _uid: "section-root",
                component: "sb-section",
                body: [{ _uid: "child-1", component: "target", text: "Nested" }],
            },
        };

        const result = runMigrationPipelineInMemory({
            itemType: "preset",
            itemsToMigrate: [nestedPreset],
            preparedMigrationConfigs: [markTargetMigration],
        });

        expect(result.changedItems).toHaveLength(1);
        expect(result.finalItems[0].preset.body[0]).toEqual({
            _uid: "child-1",
            component: "target",
            text: "Nested",
            migrated: true,
        });
    });

    it("leaves presets without matching components unchanged", () => {
        const untouched = {
            id: 43,
            name: "Other preset",
            component_id: 14,
            preset: { _uid: "other-root", component: "sb-other", text: "Keep" },
        };

        const result = runMigrationPipelineInMemory({
            itemType: "preset",
            itemsToMigrate: [untouched],
            preparedMigrationConfigs: [markTargetMigration],
        });

        expect(result.changedItems).toHaveLength(0);
        expect(result.finalItems[0]).toEqual(untouched);
    });

    it("runs a multi-step preset pipeline in order with per-step reports", () => {
        const result = runMigrationPipelineInMemory({
            itemType: "preset",
            itemsToMigrate: [createPresetItem()],
            preparedMigrationConfigs: [
                markTargetMigration,
                renameTargetMigration,
            ],
        });

        expect(result.finalItems[0].preset).toEqual({
            _uid: "preset-root",
            component: "target-v2",
            text: "Hello",
            migrated: true,
        });
        expect(
            result.stepReports.map((step) => step.migrationConfig),
        ).toEqual(["mark-target", "rename-target"]);
        expect(result.stepReports[0]?.touchedItems).toBe(1);
        expect(result.stepReports[1]?.touchedItems).toBe(1);
    });

    it("runs a per-step validator against the presets produced by that step", () => {
        const seenComponents: string[] = [];
        const recordComponent = (id: string) => ({
            id,
            name: id,
            sourcePath: `/test/${id}.sb.validation.cjs`,
            validateData: ({ data }: { data: any }) => {
                seenComponents.push(data[0].preset.component);
                return { ok: true, issueCount: 0, issues: [] };
            },
        });

        const result = runMigrationPipelineInMemory({
            itemType: "preset",
            itemsToMigrate: [createPresetItem()],
            preparedMigrationConfigs: [
                { ...markTargetMigration, validator: recordComponent("after-mark") },
                {
                    ...renameTargetMigration,
                    validator: recordComponent("after-rename"),
                },
            ],
        });

        // Each validator sees the preset state as of its own step.
        expect(seenComponents).toEqual(["target", "target-v2"]);
        expect(
            result.stepReports.map((step) => step.validation?.validatorId),
        ).toEqual(["after-mark", "after-rename"]);
    });

    it("halts the preset pipeline when a step validator fails", () => {
        const failingValidator = {
            id: "no-target-left",
            name: "no-target-left",
            sourcePath: "/test/no-target-left.sb.validation.cjs",
            validateData: () => ({
                ok: false,
                issueCount: 1,
                issues: [
                    {
                        componentPath: "preset",
                        component: "target",
                        uid: "preset-root",
                        message: "target is not allowed",
                    },
                ],
            }),
        };

        expect(() =>
            runMigrationPipelineInMemory({
                itemType: "preset",
                itemsToMigrate: [createPresetItem()],
                preparedMigrationConfigs: [
                    { ...markTargetMigration, validator: failingValidator },
                    renameTargetMigration,
                ],
            }),
        ).toThrow(MigrationValidationFailedError);
    });
});

describe("preset migration write path", () => {
    it("writes changed presets through presets.updatePresets with no publish options", async () => {
        await doTheMigration(
            {
                itemType: "preset",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createPresetItem()],
                migrationConfigs: [markTargetMigration],
                fileName: "preset-write-test",
            },
            config,
        );

        expect(updatePresetsMock).toHaveBeenCalledTimes(1);
        const [updateArgs] = updatePresetsMock.mock.calls[0];
        expect(updateArgs.spaceId).toBe("space-1");
        expect(updateArgs.options).toEqual({});
        expect(updateArgs.presets).toHaveLength(1);
        expect(updateArgs.presets[0]).toMatchObject({
            id: 41,
            name: "Hero preset",
            preset: { component: "target", migrated: true },
        });

        // Presets are exempt from every piece of story publication machinery.
        expect(updateStoriesMock).not.toHaveBeenCalled();
        expect(resolvePublishLanguageCodesMock).not.toHaveBeenCalled();

        expect(modifyAppliedMigrationsMock).toHaveBeenCalledWith(
            "mark-target",
            "preset",
        );
    });

    it("writes nothing when no preset changed", async () => {
        await doTheMigration(
            {
                itemType: "preset",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [
                    {
                        id: 43,
                        name: "Other preset",
                        component_id: 14,
                        preset: { _uid: "other", component: "sb-other" },
                    },
                ],
                migrationConfigs: [markTargetMigration],
                fileName: "preset-noop-test",
            },
            config,
        );

        expect(updatePresetsMock).not.toHaveBeenCalled();
    });
});

describe("preset pre-migration backup", () => {
    const backupDir = () => path.join(tmpDir, "backup", "preset");
    const listBackups = () =>
        fs.existsSync(backupDir()) ? fs.readdirSync(backupDir()) : [];

    const runFromSpace = (dryRun?: boolean) =>
        migrateProvidedComponentsDataInStories(
            {
                itemType: "preset",
                from: "space-A",
                to: "space-A",
                migrateFrom: "space",
                migrationConfig: [],
                preparedMigrationConfigs: [markTargetMigration],
                dryRun,
                fileName: "preset-backup-test",
            },
            config,
        );

    it("writes exactly one backup, of the --from space, into backup/preset", async () => {
        getAllPresetsMock.mockResolvedValue([createPresetItem()]);

        await runFromSpace();

        // Presets are pulled from --from, not from the config's default space.
        expect(getAllPresetsMock).toHaveBeenCalledTimes(1);
        expect(getAllPresetsMock).toHaveBeenCalledWith(
            expect.objectContaining({ spaceId: "space-A" }),
        );

        const backups = listBackups();
        expect(backups).toHaveLength(1);
        expect(backups[0]).toContain("preset-backup-test");
        expect(backups[0]).toContain(".sb.presets.json");
        expect(
            JSON.parse(
                fs.readFileSync(path.join(backupDir(), backups[0]!), "utf-8"),
            ),
        ).toEqual([createPresetItem()]);
    });

    it("writes no backup on a dry run", async () => {
        getAllPresetsMock.mockResolvedValue([createPresetItem()]);

        await runFromSpace(true);

        expect(listBackups()).toHaveLength(0);
        expect(updatePresetsMock).not.toHaveBeenCalled();
    });
});

describe("presets are exempt from publication machinery", () => {
    it("normalizes an explicitly requested publication mode to save-only", async () => {
        await doTheMigration(
            {
                itemType: "preset",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createPresetItem()],
                migrationConfigs: [markTargetMigration],
                dryRun: true,
                // Callers cannot pass this via the CLI, but the engine default
                // is preserve-layers and must not leak into preset runs.
                publicationMode: "preserve-layers",
                publicationLanguages: "all",
                fileName: "preset-mode-test",
            },
            config,
        );

        const manifest = readJson(
            "dry-run--preset-mode-test---preset-continue-manifest.json",
        );
        expect(manifest.publicationMode).toBe("save-only");
        expect(manifest.publishLanguages).toBeNull();
        expect(resolvePublishLanguageCodesMock).not.toHaveBeenCalled();

        const pipelineSummary = readJson(
            "dry-run--preset-mode-test---preset-migration-pipeline-summary.json",
        );
        // The manifest now agrees with what savePipelineSummary already recorded.
        expect(pipelineSummary.publicationMode).toBe("save-only");
    });

    it("reports progress in presets, not stories", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        try {
            await doTheMigration(
                {
                    itemType: "preset",
                    from: "space-1",
                    to: "space-1",
                    migrateFrom: "space",
                    itemsToMigrate: [createPresetItem()],
                    migrationConfigs: [markTargetMigration],
                    dryRun: true,
                    fileName: "preset-progress-test",
                },
                config,
            );

            const output = logSpy.mock.calls.map((call) => call[0]).join("\n");

            expect(output).toContain("1 preset(s) to migrate");
            expect(output).toContain("Migration in Hero preset preset:");
            expect(output).not.toMatch(/stories to migrate/);
            expect(output).not.toContain("undefined");
        } finally {
            logSpy.mockRestore();
        }
    });

    it("says '# No preset(s) to update #' when nothing changed", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        try {
            await doTheMigration(
                {
                    itemType: "preset",
                    from: "space-1",
                    to: "space-1",
                    migrateFrom: "space",
                    itemsToMigrate: [
                        {
                            id: 43,
                            name: "Other preset",
                            component_id: 14,
                            preset: { _uid: "other", component: "sb-other" },
                        },
                    ],
                    migrationConfigs: [markTargetMigration],
                    dryRun: true,
                    fileName: "preset-empty-test",
                },
                config,
            );

            const output = logSpy.mock.calls.map((call) => call[0]).join("\n");

            expect(output).toContain("# No preset(s) to update #");
            expect(output).not.toContain("No Stories to update");
        } finally {
            logSpy.mockRestore();
        }
    });
});

describe("preset dry-run → migrate continue", () => {
    const runPresetDryRun = () =>
        doTheMigration(
            {
                itemType: "preset",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createPresetItem()],
                migrationConfigs: [markTargetMigration],
                dryRun: true,
                fileName: "preset-cont-test",
            },
            config,
        );

    it("dry-run writes a preset continue manifest pointing at the real artifacts", async () => {
        await runPresetDryRun();

        expect(updatePresetsMock).not.toHaveBeenCalled();

        const manifest = readJson(
            "dry-run--preset-cont-test---preset-continue-manifest.json",
        );
        expect(manifest.kind).toBe("migrate-content-continue-manifest");
        expect(manifest.manifestVersion).toBe(1);
        expect(manifest.itemType).toBe("preset");
        expect(manifest.to).toBe("space-1");
        expect(manifest.migrationConfigNames).toEqual(["mark-target"]);
        // Presets cannot be published: no publication mode, no languages.
        expect(manifest.publicationMode).toBe("save-only");
        expect(manifest.publishLanguages).toBeNull();
        expect(manifest.resolvedPublishLanguages).toBeNull();
        expect(manifest.artifacts.changedItems).toBe(
            "dry-run--preset-cont-test---preset-to-migrate.json",
        );
        expect(manifest.artifacts.pipelineSummary).toBe(
            "dry-run--preset-cont-test---preset-migration-pipeline-summary.json",
        );
        // Presets have no draft/published layers.
        expect(manifest.artifacts.draftAfterFull).toBeNull();
        expect(manifest.artifacts.publishedAfterFull).toBeNull();
        expect(manifest.artifacts.dirtyPublishedRecords).toBeNull();
    });

    it("continue replays the migrated presets to Storyblok without re-pulling", async () => {
        await runPresetDryRun();

        const plan = await prepareContinueMigration({}, config);

        expect(plan.summary.itemType).toBe("preset");
        expect(plan.summary.publicationMode).toBe("save-only");
        expect(plan.summary.resolvedPublishLanguages).toEqual([]);
        expect(plan.summary.to).toBe("space-1");
        expect(plan.summary.changedCount).toBe(1);
        expect(plan.summary.dirtyPublishedCount).toBe(0);
        expect(plan.summary.migrationConfigNames).toEqual(["mark-target"]);
        expect(updatePresetsMock).not.toHaveBeenCalled();
        expect(getAllPresetsMock).not.toHaveBeenCalled();

        await plan.run();

        // The exact same write a real migrate-presets run would make.
        expect(updatePresetsMock).toHaveBeenCalledTimes(1);
        const [updateArgs] = updatePresetsMock.mock.calls[0];
        expect(updateArgs.spaceId).toBe("space-1");
        expect(updateArgs.options).toEqual({});
        expect(updateArgs.presets).toHaveLength(1);
        expect(updateArgs.presets[0]).toMatchObject({
            id: 41,
            name: "Hero preset",
            preset: { component: "target", migrated: true },
        });

        expect(modifyAppliedMigrationsMock).toHaveBeenCalledWith(
            "mark-target",
            "preset",
        );

        const runLogArgs = saveMigrationRunLogMock.mock.calls[0][0];
        expect(runLogArgs.continuedFromManifest).toBe(
            "dry-run--preset-cont-test---preset-continue-manifest.json",
        );
    });
});
