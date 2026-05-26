import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    createAndSaveToFileMock,
    modifyAppliedMigrationsMock,
    saveMigrationRunLogMock,
    loggerMock,
    getStoryVersionsMock,
    getStoryByIdMock,
    updateStoryMock,
    publishStoryLanguagesMock,
    resolvePublishLanguageCodesMock,
} = vi.hoisted(() => ({
    createAndSaveToFileMock: vi.fn(),
    modifyAppliedMigrationsMock: vi.fn(),
    saveMigrationRunLogMock: vi.fn(),
    loggerMock: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
    getStoryVersionsMock: vi.fn(),
    getStoryByIdMock: vi.fn(),
    updateStoryMock: vi.fn(),
    publishStoryLanguagesMock: vi.fn(),
    resolvePublishLanguageCodesMock: vi.fn(),
}));

vi.mock("../../src/utils/files.js", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;

    return {
        ...actual,
        createAndSaveToFile: createAndSaveToFileMock,
    };
});

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
            getStoryVersions: getStoryVersionsMock,
            getStoryById: getStoryByIdMock,
            updateStory: updateStoryMock,
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
    type PreparedMigrationConfig,
} from "../../src/api/data-migration/component-data-migration.js";

const migrationConfig: PreparedMigrationConfig = {
    migrationConfigName: "mark-target",
    migrationConfigPath: "/test/mark-target.sb.migration.cjs",
    migrationConfigFileContent: {
        target: (data: any) => ({
            wasReplaced: true,
            data: {
                ...data,
                migrated: true,
            },
        }),
    },
    componentsToMigrate: ["target"],
    validator: null,
};

const createDirtyStoryItem = () => ({
    story: {
        id: "story-1",
        name: "Contact Us",
        full_slug: "translation-migration-testing/test-1/contact-us",
        published: true,
        unpublished_changes: true,
        current_version_id: "version-draft",
        updated_at: "2026-05-21T14:54:00.000Z",
        published_at: "2026-05-21T14:53:56.000Z",
        content: {
            component: "page",
            body: [
                {
                    component: "target",
                    text: "French Text Saved Again",
                },
            ],
        },
    },
});

const publishedVersionContent = {
    component: "page",
    body: [
        {
            component: "target",
            text: "French Text Published Again",
        },
    ],
};

const config = {
    spaceId: "space-1",
    sbmigWorkingDirectory: "sbmig",
    sbApi: {},
} as any;

describe("published layer content migration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createAndSaveToFileMock.mockResolvedValue(undefined);
        modifyAppliedMigrationsMock.mockResolvedValue(undefined);
        saveMigrationRunLogMock.mockResolvedValue(undefined);
        resolvePublishLanguageCodesMock.mockResolvedValue(["[default]"]);
        getStoryVersionsMock.mockResolvedValue({
            story_versions: [
                {
                    id: "published-version-1",
                    status: "published",
                    created_at: "2026-05-21T14:53:56.000Z",
                    content: publishedVersionContent,
                },
            ],
        });
        getStoryByIdMock.mockResolvedValue({
            story: createDirtyStoryItem().story,
        });
        updateStoryMock.mockResolvedValue({
            ok: true,
            stage: "update",
            id: "story-1",
            name: "Contact Us",
            slug: "translation-migration-testing/test-1/contact-us",
        });
        publishStoryLanguagesMock.mockResolvedValue({
            ok: true,
            stage: "publish",
            id: "story-1",
            name: "Contact Us",
            slug: "translation-migration-testing/test-1/contact-us",
        });
    });

    it("writes dry-run draft and published-layer artifacts without Storyblok writes", async () => {
        await doTheMigration(
            {
                itemType: "story",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createDirtyStoryItem()],
                migrationConfigs: [migrationConfig],
                dryRun: true,
                publicationMode: "preserve-layers",
                fileName: "published-layer-test",
            },
            config,
        );

        expect(updateStoryMock).not.toHaveBeenCalled();
        expect(publishStoryLanguagesMock).not.toHaveBeenCalled();

        const artifactFilenames = createAndSaveToFileMock.mock.calls.map(
            ([args]) => args.filename,
        );

        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---draft-current-input-full",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---draft-current-after-full",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---published-layer-input-full",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---published-layer-after-full",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---published-layer-summary",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---language-publish-state-map",
        );
        expect(artifactFilenames).toContain(
            "dry-run--published-layer-test---publication-plan-summary",
        );

        const summaryCall = createAndSaveToFileMock.mock.calls.find(
            ([args]) =>
                args.filename ===
                "dry-run--published-layer-test---published-layer-summary",
        );

        expect(summaryCall?.[0].res.counts).toMatchObject({
            dirtyPublishedStories: 1,
            dirtyPublishedWithPublishedLayer: 1,
            draftCurrentStoriesChanged: 1,
            publishedLayerStoriesChanged: 1,
        });
    });

    it("updates and publishes the published layer before restoring the draft layer", async () => {
        await doTheMigration(
            {
                itemType: "story",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createDirtyStoryItem()],
                migrationConfigs: [migrationConfig],
                dryRun: false,
                publicationMode: "preserve-layers",
                fileName: "published-layer-test",
            },
            config,
        );

        expect(getStoryByIdMock).toHaveBeenCalledWith("story-1", {
            ...config,
            spaceId: "space-1",
        });
        expect(updateStoryMock).toHaveBeenCalledTimes(2);
        expect(updateStoryMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                content: {
                    component: "page",
                    body: [
                        {
                            component: "target",
                            text: "French Text Published Again",
                            migrated: true,
                        },
                    ],
                },
            }),
            "story-1",
            { publish: false },
            { ...config, spaceId: "space-1" },
        );
        expect(publishStoryLanguagesMock).toHaveBeenCalledWith(
            {
                storyId: "story-1",
                story: expect.objectContaining({
                    content: {
                        component: "page",
                        body: [
                            {
                                component: "target",
                                text: "French Text Published Again",
                                migrated: true,
                            },
                        ],
                    },
                }),
                languages: ["[default]"],
            },
            { ...config, spaceId: "space-1" },
        );
        expect(updateStoryMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                content: {
                    component: "page",
                    body: [
                        {
                            component: "target",
                            text: "French Text Saved Again",
                            migrated: true,
                        },
                    ],
                },
            }),
            "story-1",
            { publish: false },
            { ...config, spaceId: "space-1" },
        );
        expect(updateStoryMock.mock.invocationCallOrder[0]).toBeLessThan(
            updateStoryMock.mock.invocationCallOrder[1],
        );
    });

    it("fails dry run after writing a summary when a dirty story has no published version", async () => {
        getStoryVersionsMock.mockResolvedValue({
            story_versions: [
                {
                    id: "draft-version-1",
                    status: "draft",
                    created_at: "2026-05-21T14:54:00.000Z",
                    content: createDirtyStoryItem().story.content,
                },
            ],
        });

        await expect(
            doTheMigration(
                {
                    itemType: "story",
                    from: "space-1",
                    to: "space-1",
                    migrateFrom: "space",
                    itemsToMigrate: [createDirtyStoryItem()],
                    migrationConfigs: [migrationConfig],
                    dryRun: true,
                    publicationMode: "preserve-layers",
                    fileName: "published-layer-test",
                },
                config,
            ),
        ).rejects.toThrow(
            "Missing published Story Version for dirty published story/stories",
        );

        const summaryCall = createAndSaveToFileMock.mock.calls.find(
            ([args]) =>
                args.filename ===
                "dry-run--published-layer-test---published-layer-summary",
        );

        expect(summaryCall?.[0].res.counts).toMatchObject({
            dirtyPublishedStories: 1,
            dirtyPublishedWithPublishedLayer: 0,
            dirtyPublishedMissingPublishedLayer: 1,
        });
        expect(updateStoryMock).not.toHaveBeenCalled();
    });

    it("refuses to write when the story changed after migration input was read", async () => {
        getStoryByIdMock.mockResolvedValue({
            story: {
                ...createDirtyStoryItem().story,
                current_version_id: "newer-version",
            },
        });

        await doTheMigration(
            {
                itemType: "story",
                from: "space-1",
                to: "space-1",
                migrateFrom: "space",
                itemsToMigrate: [createDirtyStoryItem()],
                migrationConfigs: [migrationConfig],
                dryRun: false,
                publicationMode: "preserve-layers",
                fileName: "published-layer-test",
            },
            config,
        );

        expect(updateStoryMock).not.toHaveBeenCalled();
        expect(saveMigrationRunLogMock).toHaveBeenCalled();
        const runLogArgs = saveMigrationRunLogMock.mock.calls[0][0];
        expect(runLogArgs.writeSummary).toMatchObject({
            total: 1,
            successful: 0,
            failed: 1,
        });
        expect(runLogArgs.writeSummary.failedItems[0].response).toContain(
            "Story changed after migration input was read",
        );
    });
});
