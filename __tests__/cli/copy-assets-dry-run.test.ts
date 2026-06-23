import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
                outputPath,
        );
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --all",
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
