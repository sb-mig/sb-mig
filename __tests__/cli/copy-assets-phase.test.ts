import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: { spaceId: "test", sbApi: {} },
    sbApi: {},
}));

const getAllAssets = vi.fn();
const getAllAssetFolders = vi.fn();
const downloadAsset = vi.fn();
const createAssetAndFinalize = vi.fn();
const updateAsset = vi.fn();
const createAssetFolder = vi.fn();
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        assets: {
            getAllAssets: (...a: any[]) => getAllAssets(...a),
            getAllAssetFolders: (...a: any[]) => getAllAssetFolders(...a),
            downloadAsset: (...a: any[]) => downloadAsset(...a),
            createAssetAndFinalize: (...a: any[]) =>
                createAssetAndFinalize(...a),
            updateAsset: (...a: any[]) => updateAsset(...a),
            createAssetFolder: (...a: any[]) => createAssetFolder(...a),
        },
    },
}));

const { copyAssetsAndWriteManifests } = await import(
    "../../src/cli/commands/copy.js"
);
const { buildCopyAssetsGraph } = await import(
    "../../src/api/copy/index.js"
);

const asset = (id: number) => ({
    id,
    filename: `https://a.storyblok.com/f/1/1x1/h${id}/file-${id}.png`,
    asset_folder_id: null,
    space_id: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    content_length: 100,
    content_type: "image/png" as const,
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
});

const folder = (id: number, parentId: number | null = null) => ({
    id,
    name: `folder-${id}`,
    parent_id: parentId,
});

describe("copyAssetsAndWriteManifests (parallel)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-assets-"));
        for (const mock of [
            getAllAssets,
            getAllAssetFolders,
            downloadAsset,
            createAssetAndFinalize,
            updateAsset,
            createAssetFolder,
        ])
            mock.mockReset();
        getAllAssets.mockResolvedValue({ assets: [] });
        getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        downloadAsset.mockResolvedValue("/tmp/file.png");
        createAssetAndFinalize.mockImplementation(({ payload }: any) =>
            Promise.resolve({
                id: Math.floor(Math.random() * 100000),
                filename: payload.filename.replace("/f/1/", "/f/2/"),
            }),
        );
    });

    it("copies assets in parallel and reports created counts", async () => {
        const sourceAssets = [asset(1), asset(2), asset(3)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        const report = await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        expect(report.summary.assetsCreated).toBe(3);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(3);
    });

    it("one failed asset does not abort the others", async () => {
        createAssetAndFinalize
            .mockRejectedValueOnce(new Error("upload failed"))
            .mockImplementation(({ payload }: any) =>
                Promise.resolve({ id: 9, filename: payload.filename }),
            );
        const sourceAssets = [asset(1), asset(2)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        const outputPath = path.join(manifestRoot, "report.json");
        await expect(
            copyAssetsAndWriteManifests({
                sourceSpace: "1",
                targetSpace: "2",
                selection: { type: "all" },
                input: {},
                graph,
                sourceAssets,
                sourceAssetFolders: [],
                manifestRoot,
                outputPath,
                writeConcurrency: 4,
            }),
        ).rejects.toThrow(/1 asset/);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(2);

        // The failed asset must not read back as a successful create: the
        // report is written (before the throw) with the graph node reset to
        // an honest "unknown" action and no fabricated target filename.
        const report = JSON.parse(await fs.readFile(outputPath, "utf8"));
        expect(report.summary.assetsFailed).toBe(1);
        const failedNode = report.graph.assets.find(
            (node: any) => node.sourceId === 1,
        );
        expect(failedNode.action).not.toBe("create");
        expect(failedNode.targetFilename).toBeUndefined();
    });

    it("skips the target asset fetch when everything is already mapped", async () => {
        // First run to populate the manifest.
        const sourceAssets = [asset(1)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        getAllAssets.mockClear();
        // Second run: all mapped.
        const graphTwo = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph: graphTwo,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        expect(getAllAssets).not.toHaveBeenCalled();
    });
});

describe("copyAssetsAndWriteManifests (asset folders)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "sbmig-asset-folders-"),
        );
        for (const mock of [
            getAllAssets,
            getAllAssetFolders,
            downloadAsset,
            createAssetAndFinalize,
            updateAsset,
            createAssetFolder,
        ])
            mock.mockReset();
        getAllAssets.mockResolvedValue({ assets: [] });
        getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        downloadAsset.mockResolvedValue("/tmp/file.png");
        createAssetAndFinalize.mockImplementation(({ payload }: any) =>
            Promise.resolve({
                id: Math.floor(Math.random() * 100000),
                filename: payload.filename.replace("/f/1/", "/f/2/"),
            }),
        );
        createAssetFolder.mockImplementation(({ payload }: any) =>
            Promise.resolve({
                asset_folder: {
                    id: Math.floor(Math.random() * 100000) + 1000,
                    name: payload.name,
                    parent_id: payload.parent_id,
                },
            }),
        );
    });

    it("creates parent folders before child folders in a two-level tree", async () => {
        const sourceFolders = [folder(10, null), folder(20, 10)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: [],
            assetFolders: sourceFolders,
        });
        await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph,
            sourceAssets: [],
            sourceAssetFolders: sourceFolders,
            manifestRoot,
            writeConcurrency: 4,
        });

        expect(createAssetFolder).toHaveBeenCalledTimes(2);
        const [parentCall, childCall] = createAssetFolder.mock.calls;
        expect(parentCall[0].payload.name).toBe("folder-10");
        expect(parentCall[0].payload.parent_id).toBeNull();
        expect(childCall[0].payload.name).toBe("folder-20");
        // The child's parent_id is only non-null if the parent's created
        // target id was already recorded in copyMaps -- proof the parent's
        // depth level ran to completion before the child's level started.
        expect(childCall[0].payload.parent_id).not.toBeNull();
    });

    it("a failed parent folder does not abort the run; other assets and the child folder still get attempted", async () => {
        createAssetFolder
            .mockRejectedValueOnce(new Error("folder create failed"))
            .mockImplementation(({ payload }: any) =>
                Promise.resolve({
                    asset_folder: {
                        id: Math.floor(Math.random() * 100000) + 2000,
                        name: payload.name,
                        parent_id: payload.parent_id,
                    },
                }),
            );
        const sourceFolders = [folder(30, null), folder(40, 30)];
        const sourceAssets = [asset(1)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: sourceFolders,
        });

        await expect(
            copyAssetsAndWriteManifests({
                sourceSpace: "1",
                targetSpace: "2",
                selection: { type: "all" },
                input: {},
                graph,
                sourceAssets,
                sourceAssetFolders: sourceFolders,
                manifestRoot,
                writeConcurrency: 4,
            }),
        ).rejects.toThrow(/1 asset folder/);

        // Parent folder failed, but the sibling-in-time asset copy and the
        // child folder attempt both still ran.
        expect(createAssetFolder).toHaveBeenCalledTimes(2);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(1);
        // Fallback semantics: with no copyMaps entry for the failed parent,
        // the child resolves its target parent id to null, same as an
        // ancestor folder missing from the graph entirely.
        const childCall = createAssetFolder.mock.calls[1][0];
        expect(childCall.payload.parent_id).toBeNull();
    });
});
