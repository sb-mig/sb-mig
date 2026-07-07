import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    modifyAppliedMigrationsMock,
    saveMigrationRunLogMock,
    loggerMock,
    updateStoriesMock,
    updateStoryMock,
    getStoryByIdMock,
    getStoryVersionsMock,
    publishStoryLanguagesMock,
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
    updateStoriesMock: vi.fn(),
    updateStoryMock: vi.fn(),
    getStoryByIdMock: vi.fn(),
    getStoryVersionsMock: vi.fn(),
    publishStoryLanguagesMock: vi.fn(),
    resolvePublishLanguageCodesMock: vi.fn(),
}));

// NOTE: files.js is intentionally NOT mocked — continue relies on real disk IO
// (write artifacts in a temp dir, then read them back).
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
            updateStory: updateStoryMock,
            getStoryById: getStoryByIdMock,
            getStoryVersions: getStoryVersionsMock,
            publishStoryLanguages: publishStoryLanguagesMock,
            resolvePublishLanguageCodes: resolvePublishLanguageCodesMock,
        },
        presets: {
            updatePresets: vi.fn(),
            getAllPresets: vi.fn(),
        },
    },
}));

import {
    doTheMigration,
    findArtifactFilename,
    prepareContinueMigration,
    type PreparedMigrationConfig,
} from "../../src/api/data-migration/component-data-migration.js";

const migrationConfig: PreparedMigrationConfig = {
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

const createStoryItem = () => ({
    story: {
        id: "story-1",
        name: "Contact Us",
        full_slug: "blog/contact-us",
        current_version_id: "version-1",
        updated_at: "2026-05-21T14:54:00.000Z",
        content: {
            component: "page",
            body: [{ component: "target", text: "Hello" }],
        },
    },
});

let tmpDir: string;
let config: any;

const migrationsDir = () => path.join(tmpDir, "migrations");
const readJson = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(migrationsDir(), file), "utf-8"));
const writeJson = (file: string, data: unknown) =>
    fs.writeFileSync(
        path.join(migrationsDir(), file),
        JSON.stringify(data, null, 2),
    );

beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sbmig-continue-"));
    fs.mkdirSync(migrationsDir(), { recursive: true });
    config = {
        spaceId: "space-1",
        sbmigWorkingDirectory: tmpDir,
        sbApi: {},
    };

    modifyAppliedMigrationsMock.mockResolvedValue(undefined);
    saveMigrationRunLogMock.mockResolvedValue(undefined);
    updateStoriesMock.mockResolvedValue([
        {
            status: "fulfilled",
            value: {
                ok: true,
                stage: "update",
                id: "story-1",
                name: "Contact Us",
                slug: "blog/contact-us",
            },
        },
    ]);
    updateStoryMock.mockResolvedValue({
        ok: true,
        stage: "update",
        id: "story-1",
        name: "Contact Us",
        slug: "blog/contact-us",
    });
    publishStoryLanguagesMock.mockResolvedValue({
        ok: true,
        stage: "publish",
        id: "story-1",
        name: "Contact Us",
        slug: "blog/contact-us",
    });
    resolvePublishLanguageCodesMock.mockResolvedValue(["[default]"]);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("migrate continue (save-only round trip)", () => {
    it("dry-run writes a continue manifest that points at the real artifacts", async () => {
        await doTheMigration(
            {
                itemType: "story",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createStoryItem()],
                migrationConfigs: [migrationConfig],
                dryRun: true,
                publicationMode: "save-only",
                fileName: "cont-test",
            },
            config,
        );

        // dry-run performs no writes
        expect(updateStoriesMock).not.toHaveBeenCalled();

        const manifest = readJson(
            "dry-run--cont-test---story-continue-manifest.json",
        );
        expect(manifest.kind).toBe("migrate-content-continue-manifest");
        expect(manifest.manifestVersion).toBe(1);
        expect(manifest.to).toBe("space-1");
        expect(manifest.publicationMode).toBe("save-only");
        expect(manifest.migrationConfigNames).toEqual(["mark-target"]);
        expect(manifest.artifacts.changedItems).toBe(
            "dry-run--cont-test---story-to-migrate.json",
        );
        expect(manifest.artifacts.pipelineSummary).toBe(
            "dry-run--cont-test---story-migration-pipeline-summary.json",
        );
        // save-only => no language map, no published-layer artifacts
        expect(manifest.artifacts.languageStateMap).toBeNull();
        expect(manifest.artifacts.dirtyPublishedRecords).toBeNull();
    });

    it("continue replays the migrated content to Storyblok without re-pulling", async () => {
        await doTheMigration(
            {
                itemType: "story",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createStoryItem()],
                migrationConfigs: [migrationConfig],
                dryRun: true,
                publicationMode: "save-only",
                fileName: "cont-test",
            },
            config,
        );

        const plan = await prepareContinueMigration({}, config);

        expect(plan.summary.to).toBe("space-1");
        expect(plan.summary.changedCount).toBe(1);
        expect(plan.summary.migrationConfigNames).toEqual(["mark-target"]);
        expect(updateStoriesMock).not.toHaveBeenCalled();

        await plan.run();

        // The exact same write a real migrate-content would make.
        expect(updateStoriesMock).toHaveBeenCalledTimes(1);
        const [updateArgs] = updateStoriesMock.mock.calls[0];
        expect(updateArgs.spaceId).toBe("space-1");
        expect(updateArgs.options.publish).toBe(false);
        expect(updateArgs.stories).toHaveLength(1);
        expect(updateArgs.stories[0].story.content.body[0]).toMatchObject({
            component: "target",
            migrated: true,
        });

        // applied-migration tracking happens, equivalent to a real run (F1)
        expect(modifyAppliedMigrationsMock).toHaveBeenCalledWith(
            "mark-target",
            "story",
        );

        // run log is tagged with provenance (F2)
        expect(saveMigrationRunLogMock).toHaveBeenCalledTimes(1);
        const runLogArgs = saveMigrationRunLogMock.mock.calls[0][0];
        expect(runLogArgs.continuedFromManifest).toBe(
            "dry-run--cont-test---story-continue-manifest.json",
        );
    });
});

describe("migrate continue (bounded memory / batching)", () => {
    const base = "batch-test";

    const writeSaveOnlyArtifacts = (changedItems: unknown[]) => {
        writeJson(`dry-run--${base}---story-to-migrate.json`, changedItems);
        writeJson(`dry-run--${base}---story-migration-pipeline-summary.json`, {
            totalItems: changedItems.length,
            steps: [{ migrationConfig: "mark-target" }],
        });
        writeJson(`dry-run--${base}---story-continue-manifest.json`, {
            manifestVersion: 1,
            kind: "migrate-content-continue-manifest",
            itemType: "story",
            from: "space-1",
            to: "space-1",
            migrateFrom: "space",
            fromFilePath: null,
            publicationMode: "save-only",
            migrationConfigNames: ["mark-target"],
            publishLanguages: null,
            resolvedPublishLanguages: null,
            artifactBaseName: base,
            useDatestamp: false,
            artifacts: {
                changedItems: `dry-run--${base}---story-to-migrate.json`,
                pipelineSummary: `dry-run--${base}---story-migration-pipeline-summary.json`,
                inputFull: null,
                languageStateMap: null,
                draftAfterFull: null,
                publishedAfterFull: null,
                dirtyPublishedRecords: null,
            },
        });
    };

    it("writes large changed sets in batches instead of one in-memory array", async () => {
        const changedItems = Array.from({ length: 120 }, (_, index) => ({
            story: {
                id: `story-${index}`,
                name: `Story ${index}`,
                full_slug: `blog/story-${index}`,
                content: { component: "page" },
            },
        }));
        writeSaveOnlyArtifacts(changedItems);

        updateStoriesMock.mockImplementation(async ({ stories }: any) =>
            stories.map((item: any) => ({
                status: "fulfilled",
                value: { ok: true, stage: "update", id: item.story.id },
            })),
        );

        const plan = await prepareContinueMigration({}, config);
        expect(plan.summary.changedCount).toBe(120);

        await plan.run();

        // 120 items / batch size 50 => 3 write calls, order preserved.
        expect(updateStoriesMock).toHaveBeenCalledTimes(3);
        const batchSizes = updateStoriesMock.mock.calls.map(
            ([args]: any[]) => args.stories.length,
        );
        expect(batchSizes).toEqual([50, 50, 20]);
        const writtenIds = updateStoriesMock.mock.calls.flatMap(
            ([args]: any[]) => args.stories.map((item: any) => item.story.id),
        );
        expect(writtenIds).toEqual(changedItems.map((item) => item.story.id));

        // Run log sees the real count and per-item labels even though the
        // changed items were never materialized as one array.
        const runLogArgs = saveMigrationRunLogMock.mock.calls[0][0];
        expect(runLogArgs.totalChangedItems).toBe(120);
        expect(runLogArgs.changedItemLabels).toHaveLength(120);
        expect(runLogArgs.changedItemLabels[119]).toEqual({
            id: "story-119",
            name: "Story 119",
            slug: "blog/story-119",
        });
        expect(runLogArgs.pipelineResult.changedItems).toEqual([]);
    });

    it("aborts before any write when the changed-items artifact is truncated", async () => {
        writeSaveOnlyArtifacts([]);
        // Overwrite with a file cut off mid-element (dry-run killed mid-write).
        fs.writeFileSync(
            path.join(migrationsDir(), `dry-run--${base}---story-to-migrate.json`),
            '[\n  { "story": { "id": "story-0" } },\n  { "story"',
        );

        await expect(prepareContinueMigration({}, config)).rejects.toThrow(
            "Truncated JSON array",
        );
        expect(updateStoriesMock).not.toHaveBeenCalled();
    });
});

describe("migrate continue (preserve-layers reconstruction)", () => {
    const base = "pl-test";

    const writePreserveLayersArtifacts = () => {
        const draftMigrated = {
            story: {
                id: "story-1",
                name: "Contact Us",
                full_slug: "blog/contact-us",
                content: {
                    component: "page",
                    body: [
                        { component: "target", text: "draft", migrated: true },
                    ],
                },
            },
        };
        const publishedMigrated = {
            story: {
                id: "story-1",
                name: "Contact Us",
                full_slug: "blog/contact-us",
                content: {
                    component: "page",
                    body: [
                        {
                            component: "target",
                            text: "published",
                            migrated: true,
                        },
                    ],
                },
            },
        };

        const storyItem = (id: string, text: string) => ({
            story: {
                id,
                name: `Story ${id}`,
                full_slug: `blog/${id}`,
                content: {
                    component: "page",
                    body: [{ component: "target", text }],
                },
            },
        });
        // story-2: changed but NOT dirty-published; story-3: unchanged.
        // Both prove that continue only keeps the dirty subset of the
        // full-space after-full snapshots and still writes correctly.
        const nonDirtyChanged = storyItem("story-2", "changed-non-dirty");
        const unchanged = storyItem("story-3", "unchanged");

        writeJson(`dry-run--${base}---story-to-migrate.json`, [
            draftMigrated,
            nonDirtyChanged,
        ]);
        writeJson(`dry-run--${base}---draft-current-after-full.json`, [
            draftMigrated,
            nonDirtyChanged,
            unchanged,
        ]);
        writeJson(`dry-run--${base}---published-layer-after-full.json`, [
            publishedMigrated,
            nonDirtyChanged,
            unchanged,
        ]);
        writeJson(`dry-run--${base}---story-migration-pipeline-summary.json`, {
            totalItems: 1,
            steps: [{ migrationConfig: "mark-target" }],
        });
        writeJson(`dry-run--${base}---dirty-published-records.json`, {
            publishedChangedIds: ["story-1"],
            dirtyPublishedRecords: [
                {
                    storyId: "story-1",
                    name: "Contact Us",
                    full_slug: "blog/contact-us",
                    state: "dirty-published",
                    missingPublishedLayer: false,
                    draftCurrentItem: {
                        story: {
                            id: "story-1",
                            name: "Contact Us",
                            full_slug: "blog/contact-us",
                            current_version_id: "version-1",
                            updated_at: "2026-05-21T14:54:00.000Z",
                            content: {
                                component: "page",
                                body: [{ component: "target", text: "draft" }],
                            },
                        },
                    },
                },
            ],
        });

        const manifest = {
            manifestVersion: 1,
            kind: "migrate-content-continue-manifest",
            itemType: "story",
            from: "space-1",
            to: "space-1",
            migrateFrom: "space",
            fromFilePath: null,
            publicationMode: "preserve-layers",
            migrationConfigNames: ["mark-target"],
            publishLanguages: { requested: "all" },
            resolvedPublishLanguages: ["[default]"],
            artifactBaseName: base,
            useDatestamp: false,
            artifacts: {
                changedItems: `dry-run--${base}---story-to-migrate.json`,
                pipelineSummary: `dry-run--${base}---story-migration-pipeline-summary.json`,
                inputFull: null,
                languageStateMap: null,
                draftAfterFull: `dry-run--${base}---draft-current-after-full.json`,
                publishedAfterFull: `dry-run--${base}---published-layer-after-full.json`,
                dirtyPublishedRecords: `dry-run--${base}---dirty-published-records.json`,
            },
        };
        writeJson(`dry-run--${base}---story-continue-manifest.json`, manifest);
    };

    it("reconstructs the dirty-published write path and never re-fetches versions", async () => {
        getStoryByIdMock.mockResolvedValue({
            story: {
                id: "story-1",
                name: "Contact Us",
                full_slug: "blog/contact-us",
                current_version_id: "version-1",
                updated_at: "2026-05-21T14:54:00.000Z",
            },
        });
        writePreserveLayersArtifacts();

        const plan = await prepareContinueMigration({}, config);
        expect(plan.summary.dirtyPublishedCount).toBe(1);

        await plan.run();

        // Published-layer rebuild is NOT re-run during continue.
        expect(getStoryVersionsMock).not.toHaveBeenCalled();

        // Dual-layer write: published layer first, then draft restore (2 updateStory).
        expect(updateStoryMock).toHaveBeenCalledTimes(2);
        expect(updateStoryMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                content: expect.objectContaining({
                    body: [
                        expect.objectContaining({
                            text: "published",
                            migrated: true,
                        }),
                    ],
                }),
            }),
            "story-1",
            { publish: false },
            { ...config, spaceId: "space-1" },
        );
        expect(publishStoryLanguagesMock).toHaveBeenCalledTimes(1);
        expect(updateStoryMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                content: expect.objectContaining({
                    body: [
                        expect.objectContaining({
                            text: "draft",
                            migrated: true,
                        }),
                    ],
                }),
            }),
            "story-1",
            { publish: false },
            { ...config, spaceId: "space-1" },
        );

        // The non-dirty changed story goes through the regular batched write,
        // with the dirty story filtered out of the batch.
        expect(updateStoriesMock).toHaveBeenCalledTimes(1);
        const [batchArgs] = updateStoriesMock.mock.calls[0];
        expect(
            batchArgs.stories.map((item: any) => item.story.id),
        ).toEqual(["story-2"]);

        // Run-log labels stay aligned with write order: batched non-dirty
        // writes first, dirty dual-layer writes after.
        const runLogArgs = saveMigrationRunLogMock.mock.calls[0][0];
        expect(
            runLogArgs.changedItemLabels.map((label: any) => label.id),
        ).toEqual(["story-2", "story-1"]);
        expect(runLogArgs.totalChangedItems).toBe(2);
    });
});

describe("findArtifactFilename (chronological, not lexicographic)", () => {
    const stem = "dry-run--12345---story-to-migrate";

    it("returns the single non-datestamped match", () => {
        expect(
            findArtifactFilename([`${stem}.json`, "unrelated.json"], stem),
        ).toBe(`${stem}.json`);
    });

    it("returns null when nothing matches", () => {
        expect(findArtifactFilename(["other.json"], stem)).toBeNull();
    });

    it("picks the newest by date, not by lexicographic order (unpadded datestamps)", () => {
        // "15" sorts before "9" lexicographically, but Jan 15 is newer than Jan 9.
        const older = `${stem}__2026-1-9_9-30.json`;
        const newer = `${stem}__2026-1-15_9-30.json`;
        expect(findArtifactFilename([older, newer], stem)).toBe(newer);
        expect(findArtifactFilename([newer, older], stem)).toBe(newer);
    });

    it("orders correctly across month boundaries (9 vs 10)", () => {
        const older = `${stem}__2026-9-1_0-0.json`;
        const newer = `${stem}__2026-10-1_0-0.json`;
        expect(findArtifactFilename([newer, older], stem)).toBe(newer);
    });

    it("does not match a different stem that shares a prefix", () => {
        const input = `dry-run--12345---story-input-full__2026-1-9_9-30.json`;
        expect(findArtifactFilename([input], stem)).toBeNull();
    });
});

describe("migrate continue (discovery + validation)", () => {
    it("throws a clear error when no manifest exists", async () => {
        await expect(prepareContinueMigration({}, config)).rejects.toThrow(
            "No dry-run found to continue",
        );
    });

    it("requires --manifest when multiple manifests exist", async () => {
        writeJson("dry-run--a---story-continue-manifest.json", {
            manifestVersion: 1,
            kind: "migrate-content-continue-manifest",
        });
        writeJson("dry-run--b---story-continue-manifest.json", {
            manifestVersion: 1,
            kind: "migrate-content-continue-manifest",
        });

        await expect(prepareContinueMigration({}, config)).rejects.toThrow(
            "Multiple dry-run manifests found",
        );
    });

    it("rejects a file that is not a continue manifest", async () => {
        writeJson("dry-run--x---story-continue-manifest.json", {
            manifestVersion: 1,
            kind: "something-else",
        });

        await expect(prepareContinueMigration({}, config)).rejects.toThrow(
            "Not a continue manifest",
        );
    });

    it("rejects an unsupported manifest version", async () => {
        writeJson("dry-run--x---story-continue-manifest.json", {
            manifestVersion: 99,
            kind: "migrate-content-continue-manifest",
        });

        await expect(prepareContinueMigration({}, config)).rejects.toThrow(
            "Unsupported continue manifest version",
        );
    });
});
