import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
    createAsset: vi.fn(),
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
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getAllAssetFolders.mockResolvedValue({
            asset_folders: [
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
            ],
        });
        mocks.getAllAssets.mockResolvedValue({
            assets: [
                {
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
                    meta_data: {},
                    internal_tags_list: [],
                },
            ],
        });
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
                "apply_not_implemented",
                "target_conflicts_not_checked",
                "target_asset_identity_not_resolved",
                "asset_folder_manifest_not_written",
                "asset_manifest_not_written",
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

    it("blocks real apply until target asset manifest support exists", async () => {
        await expect(
            copyCommand({
                input: ["copy", "assets"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    all: true,
                },
            } as any),
        ).rejects.toThrow("copy assets apply is not implemented yet");

        expect(mocks.getAllAssets).not.toHaveBeenCalled();
        expect(mocks.getAllAssetFolders).not.toHaveBeenCalled();
    });
});
