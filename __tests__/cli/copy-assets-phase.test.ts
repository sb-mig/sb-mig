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
                writeConcurrency: 4,
            }),
        ).rejects.toThrow(/1 asset/);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(2);
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
