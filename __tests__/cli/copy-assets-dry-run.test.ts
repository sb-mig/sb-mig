import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    getAllComponents: vi.fn(),
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
    createAsset: vi.fn(),
    createAssetFolder: vi.fn(),
    createAssetAndFinalize: vi.fn(),
    downloadAsset: vi.fn(),
    updateAsset: vi.fn(),
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "default-space",
        sbApi: {},
    },
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            getStoryBySlug: mocks.getStoryBySlug,
            getAllStories: mocks.getAllStories,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        assets: {
            getAllAssets: mocks.getAllAssets,
            getAllAssetFolders: mocks.getAllAssetFolders,
            createAsset: mocks.createAsset,
            createAssetFolder: mocks.createAssetFolder,
            createAssetAndFinalize: mocks.createAssetAndFinalize,
            downloadAsset: mocks.downloadAsset,
            updateAsset: mocks.updateAsset,
        },
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { copyCommand } from "../../src/cli/commands/copy.js";

const quoteCommandArg = (value: string): string =>
    /^[a-zA-Z0-9_./:-]+$/.test(value) ? value : JSON.stringify(value);

describe("copy assets dry-run", () => {
    const sourceAsset = {
        id: 200,
        filename: "https://a.storyblok.com/f/123/nested/image.jpg",
        space_id: 123,
        created_at: "2026-06-23T10:00:00.000Z",
        updated_at: "2026-06-23T10:00:00.000Z",
        asset_folder_id: 20,
        deleted_at: null,
        content_length: 100,
        content_type: "image/jpg",
        alt: "",
        copyright: "",
        title: "",
        focus: "",
        ext_id: null,
        expire_at: null,
        source: "",
        internal_tag_ids: [],
        locked: false,
        is_private: false,
        publish_at: null,
        meta_data: undefined,
        internal_tags_list: [],
    };
    const sourceStory = {
        story: {
            id: 100,
            uuid: "source-story-uuid",
            name: "Post",
            slug: "post",
            full_slug: "blog/post",
            parent_id: 0,
            is_folder: false,
            content: {
                component: "page",
                image: {
                    id: 200,
                    filename: "https://a.storyblok.com/f/123/nested/image.jpg",
                },
            },
        },
    };
    const sourceAssetFolders = [
        {
            id: 10,
            name: "Root",
            parent_id: null,
        },
        {
            id: 20,
            name: "Nested",
            parent_id: 10,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "blog/post") {
                return Promise.resolve(sourceStory);
            }

            return Promise.resolve(undefined);
        });
        mocks.getAllStories.mockResolvedValue([]);
        mocks.getAllComponents.mockResolvedValue([
            {
                name: "page",
                schema: {
                    image: {
                        type: "asset",
                    },
                },
            },
        ]);
        mocks.getAllAssetFolders.mockImplementation(({ spaceId }) => {
            if (spaceId === "source-space") {
                return Promise.resolve({
                    asset_folders: sourceAssetFolders,
                });
            }

            return Promise.resolve({
                asset_folders: [],
            });
        });
        mocks.getAllAssets.mockImplementation(({ spaceId }) => {
            if (spaceId === "source-space") {
                return Promise.resolve({
                    assets: [sourceAsset],
                });
            }

            return Promise.resolve({
                assets: [],
            });
        });
        mocks.createAssetFolder.mockImplementation(({ payload }) =>
            Promise.resolve({
                asset_folder: {
                    id: payload.name === "Root" ? 110 : 120,
                    name: payload.name,
                    parent_id: payload.parent_id,
                },
            }),
        );
        mocks.downloadAsset.mockResolvedValue("/tmp/image.jpg");
        mocks.createAssetAndFinalize.mockResolvedValue({
            id: 220,
            filename: "https://a.storyblok.com/f/456/nested/image.jpg",
            asset_folder_id: 120,
        });
        mocks.updateAsset.mockResolvedValue({});
    });

    it("writes an asset copy plan without uploading assets", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "assets-copy.json");

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                all: true,
                dryRun: true,
                outputPath,
            },
        } as any);

        expect(mocks.getAllAssets).toHaveBeenCalledWith(
            { spaceId: "source-space" },
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.getAllAssetFolders).toHaveBeenCalledWith(
            { spaceId: "source-space" },
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.createAsset).not.toHaveBeenCalled();

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            schemaVersion: 1,
            command: "copy assets",
            dryRun: true,
            input: {
                from: "source-space",
                to: "target-space",
                all: true,
                dryRun: true,
                outputPath,
            },
            normalized: {
                sourceSpaceId: "source-space",
                targetSpaceId: "target-space",
                selection: "all",
            },
            summary: {
                plannedCreates: 3,
                assetFolders: 2,
                assets: 1,
                errors: 0,
            },
            graph: {
                assetFolders: [
                    {
                        sourceId: 10,
                        sourcePath: "Root",
                        action: "create",
                    },
                    {
                        sourceId: 20,
                        sourcePath: "Root/Nested",
                        action: "create",
                    },
                ],
                assets: [
                    {
                        sourceId: 200,
                        sourceFilename:
                            "https://a.storyblok.com/f/123/nested/image.jpg",
                        sourceAssetFolderId: 20,
                        action: "create",
                    },
                ],
            },
            limitations: [
                "target_conflicts_not_checked",
                "target_asset_identity_not_resolved",
                "manifests_not_written_in_dry_run",
            ],
        });
        expect(report.commands.dryRun).toBe(
            "sb-mig copy assets --from source-space --to target-space --all --dry-run --outputPath " +
                quoteCommandArg(outputPath),
        );
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --all",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("plans one selected asset with its asset-folder ancestors", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "single-asset.json");

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                asset: "image.jpg",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.normalized.selection).toEqual({
            type: "asset",
            values: ["image.jpg"],
        });
        expect(report.summary).toMatchObject({
            plannedCreates: 3,
            assetFolders: 2,
            assets: 1,
        });
        expect(report.graph.assetFolders).toMatchObject([
            {
                sourceId: 10,
                sourcePath: "Root",
            },
            {
                sourceId: 20,
                sourcePath: "Root/Nested",
            },
        ]);
        expect(report.graph.assets).toMatchObject([
            {
                sourceId: 200,
                sourceFilename:
                    "https://a.storyblok.com/f/123/nested/image.jpg",
            },
        ]);
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --asset image.jpg",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("plans one selected asset-folder subtree with ancestors", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "asset-folder.json");
        const childAsset = {
            ...sourceAsset,
            id: 201,
            filename: "https://a.storyblok.com/f/123/nested/child/video.mp4",
            asset_folder_id: 30,
        };
        const siblingAsset = {
            ...sourceAsset,
            id: 202,
            filename: "https://a.storyblok.com/f/123/sibling/logo.png",
            asset_folder_id: 40,
        };

        mocks.getAllAssetFolders.mockResolvedValueOnce({
            asset_folders: [
                ...sourceAssetFolders,
                {
                    id: 30,
                    name: "Child",
                    parent_id: 20,
                },
                {
                    id: 40,
                    name: "Sibling",
                    parent_id: 10,
                },
            ],
        });
        mocks.getAllAssets.mockResolvedValueOnce({
            assets: [sourceAsset, childAsset, siblingAsset],
        });

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                assetFolder: "Root/Nested",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.normalized.selection).toEqual({
            type: "asset_folder",
            values: ["Root/Nested"],
        });
        expect(report.summary).toMatchObject({
            plannedCreates: 5,
            assetFolders: 3,
            assets: 2,
        });
        expect(report.graph.assetFolders).toMatchObject([
            {
                sourceId: 10,
                sourcePath: "Root",
            },
            {
                sourceId: 20,
                sourcePath: "Root/Nested",
            },
            {
                sourceId: 30,
                sourcePath: "Root/Nested/Child",
            },
        ]);
        expect(report.graph.assets.map((asset: any) => asset.sourceId)).toEqual(
            [200, 201],
        );
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --assetFolder Root/Nested",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("plans assets referenced by a selected story scope", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(
            tempDir,
            "plans",
            "referenced-assets.json",
        );

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                referencedByStories: true,
                source: "blog/post",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
            "blog/post",
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.getAllComponents).toHaveBeenCalledWith(
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(report.normalized.selection).toEqual({
            type: "referenced_by_stories",
            source: "blog/post",
            mode: "subtree",
        });
        expect(report.summary).toMatchObject({
            plannedCreates: 3,
            assetFolders: 2,
            assets: 1,
        });
        expect(report.graph.scope).toMatchObject({
            command: "copy assets",
            source: "blog/post",
            mode: "subtree",
        });
        expect(report.graph.stories).toMatchObject([
            {
                sourceId: 100,
                sourceFullSlug: "blog/post",
            },
        ]);
        expect(report.graph.assetReferences).toMatchObject([
            {
                assetId: 200,
                filename: "https://a.storyblok.com/f/123/nested/image.jpg",
                status: "planned",
            },
        ]);
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --referenced-by-stories --source blog/post --mode subtree",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("copies assets and writes asset manifests", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "reports", "assets-copy.json");
        const manifestRootOverride = path.join(tempDir, ".sb-mig");

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                all: true,
                outputPath,
                manifestRoot: manifestRootOverride,
            },
        } as any);

        expect(mocks.createAssetFolder).toHaveBeenCalledTimes(2);
        expect(mocks.createAssetFolder).toHaveBeenNthCalledWith(
            1,
            {
                spaceId: "target-space",
                payload: {
                    name: "Root",
                    parent_id: null,
                },
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.createAssetFolder).toHaveBeenNthCalledWith(
            2,
            {
                spaceId: "target-space",
                payload: {
                    name: "Nested",
                    parent_id: 110,
                },
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.downloadAsset).toHaveBeenCalledWith(
            { payload: sourceAsset },
            expect.any(Object),
        );
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledWith(
            {
                spaceId: "target-space",
                pathToFile: "/tmp/image.jpg",
                payload: {
                    filename: "https://a.storyblok.com/f/123/nested/image.jpg",
                    asset_folder_id: 120,
                },
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        const manifestRoot = path.join(
            manifestRootOverride,
            "copy",
            "source-space",
            "target-space",
        );
        const assetManifest = (
            await readFile(
                path.join(manifestRoot, "assets.manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        const folderManifest = (
            await readFile(
                path.join(manifestRoot, "asset-folders.manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(folderManifest).toMatchObject([
            {
                type: "asset_folder",
                source_id: 10,
                target_id: 110,
                source_path: "Root",
                action: "created",
            },
            {
                type: "asset_folder",
                source_id: 20,
                target_id: 120,
                source_path: "Root/Nested",
                action: "created",
            },
        ]);
        expect(assetManifest).toMatchObject([
            {
                type: "asset",
                source_id: 200,
                target_id: 220,
                source_filename:
                    "https://a.storyblok.com/f/123/nested/image.jpg",
                target_filename:
                    "https://a.storyblok.com/f/456/nested/image.jpg",
                source_asset_folder_id: 20,
                target_asset_folder_id: 120,
                action: "created",
            },
        ]);
        expect(report.summary).toMatchObject({
            assetFoldersCreated: 2,
            assetsCreated: 1,
            assetsMatched: 0,
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("copies assets referenced by stories and writes manifests", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(
            tempDir,
            "reports",
            "referenced-assets.json",
        );
        const manifestRootOverride = path.join(tempDir, ".sb-mig");

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                referencedByStories: true,
                source: "blog/post",
                outputPath,
                manifestRoot: manifestRootOverride,
            },
        } as any);

        expect(mocks.createAssetFolder).toHaveBeenCalledTimes(2);
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledTimes(1);
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledWith(
            {
                spaceId: "target-space",
                pathToFile: "/tmp/image.jpg",
                payload: {
                    filename: "https://a.storyblok.com/f/123/nested/image.jpg",
                    asset_folder_id: 120,
                },
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.normalized.selection).toEqual({
            type: "referenced_by_stories",
            source: "blog/post",
            mode: "subtree",
        });
        expect(report.summary).toMatchObject({
            assetFoldersCreated: 2,
            assetFoldersMatched: 0,
            assetsCreated: 1,
            assetsMatched: 0,
        });
        expect(report.graph.assetReferences).toMatchObject([
            {
                assetId: 200,
                status: "planned",
            },
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("uses existing manifests on rerun without uploading again", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const manifestRootOverride = path.join(tempDir, ".sb-mig");
        const manifestRoot = path.join(
            manifestRootOverride,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestRoot, { recursive: true });
        await writeFile(
            path.join(manifestRoot, "manifest.jsonl"),
            [
                JSON.stringify({
                    type: "asset_folder",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 10,
                    target_id: 110,
                    action: "created",
                    created_at: "2026-06-23T10:00:00.000Z",
                }),
                JSON.stringify({
                    type: "asset_folder",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 20,
                    target_id: 120,
                    action: "created",
                    created_at: "2026-06-23T10:00:00.000Z",
                }),
                JSON.stringify({
                    type: "asset",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 200,
                    target_id: 220,
                    source_filename:
                        "https://a.storyblok.com/f/123/nested/image.jpg",
                    target_filename:
                        "https://a.storyblok.com/f/456/nested/image.jpg",
                    action: "created",
                    created_at: "2026-06-23T10:00:00.000Z",
                }),
            ].join("\n") + "\n",
            "utf8",
        );

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: "source-space",
                to: "target-space",
                all: true,
                manifestRoot: manifestRootOverride,
            },
        } as any);

        expect(mocks.createAssetFolder).not.toHaveBeenCalled();
        expect(mocks.downloadAsset).not.toHaveBeenCalled();
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });
});
