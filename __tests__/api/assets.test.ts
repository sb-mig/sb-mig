import { describe, it, expect, vi, beforeEach } from "vitest";

const formDataMock = vi.hoisted(() => ({
    instances: [] as Array<{
        fields: Array<[string, unknown]>;
        submitUrl?: string;
    }>,
    statusCode: 204,
}));

vi.mock("form-data", () => {
    class MockFormData {
        fields: Array<[string, unknown]> = [];
        submitUrl?: string;

        constructor() {
            formDataMock.instances.push(this);
        }

        append(key: string, value: unknown) {
            this.fields.push([key, value]);
        }

        submit(
            url: string,
            callback: (
                error: Error | null,
                response?: { statusCode?: number },
            ) => void,
        ) {
            this.submitUrl = url;
            callback(null, { statusCode: formDataMock.statusCode });
        }
    }

    return { default: MockFormData };
});

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        upload: vi.fn(),
        download: vi.fn(),
    },
}));

import {
    createAsset,
    createAssetAndFinalize,
    createAssetFolder,
    finishAssetUpload,
    getAllAssetFolders,
    updateAsset,
} from "../../src/api/assets/index.js";
import { managementApi } from "../../src/api/managementApi.js";

describe("Assets API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        formDataMock.instances.length = 0;
        formDataMock.statusCode = 204;
    });

    it("exposes createAsset and updateAsset through managementApi.assets", () => {
        expect(managementApi.assets.createAsset).toBe(createAsset);
        expect(managementApi.assets.createAssetAndFinalize).toBe(
            createAssetAndFinalize,
        );
        expect(managementApi.assets.finishAssetUpload).toBe(finishAssetUpload);
        expect(managementApi.assets.updateAsset).toBe(updateAsset);
        expect(managementApi.assets.createAssetFolder).toBe(createAssetFolder);
        expect(managementApi.assets.getAllAssetFolders).toBe(
            getAllAssetFolders,
        );
    });

    it("creates asset folders with Storyblok's wrapped payload", async () => {
        const response = {
            data: {
                asset_folder: {
                    id: 42,
                    name: "Images",
                    parent_id: null,
                },
            },
        };
        const sbApi = {
            post: vi.fn().mockResolvedValue(response),
        };

        const result = await createAssetFolder(
            {
                spaceId: "12345",
                payload: {
                    name: "Images",
                    parent_id: null,
                },
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toBe(response.data);
        expect(sbApi.post).toHaveBeenCalledWith("spaces/12345/asset_folders/", {
            asset_folder: {
                name: "Images",
                parent_id: null,
            },
        });
    });

    it("retrieves asset folders with Storyblok's query parameters", async () => {
        const response = {
            data: {
                asset_folders: [
                    {
                        id: 42,
                        name: "Images",
                        parent_id: null,
                    },
                ],
            },
        };
        const sbApi = {
            get: vi.fn().mockResolvedValue(response),
        };

        const result = await getAllAssetFolders(
            {
                spaceId: "12345",
                search: "Images",
                withParent: 0,
                byIds: [42, 43],
                byUuids: ["uuid-a", "uuid-b"],
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toBe(response.data);
        expect(sbApi.get).toHaveBeenCalledWith("spaces/12345/asset_folders/", {
            search: "Images",
            with_parent: "0",
            by_ids: "42,43",
            by_uuids: "uuid-a,uuid-b",
            per_page: 100,
        });
    });

    it("creates an asset by requesting a signed upload and submitting the file", async () => {
        const signedResponseObject = {
            post_url: "https://s3.example.com/upload",
            fields: {
                key: "f/123/asset.jpg",
                policy: "signed-policy",
            },
        };
        const sbApi = {
            post: vi.fn().mockResolvedValue({ data: signedResponseObject }),
        };

        const result = await createAsset(
            {
                spaceId: "12345",
                pathToFile: "README.md",
                payload: {
                    filename: "folder/asset.jpg",
                    asset_folder_id: 42,
                    size: "100x200",
                    validate_upload: 1,
                },
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toBe(signedResponseObject);
        expect(sbApi.post).toHaveBeenCalledWith("spaces/12345/assets/", {
            filename: "asset.jpg",
            asset_folder_id: 42,
            size: "100x200",
            validate_upload: 1,
        });

        expect(formDataMock.instances).toHaveLength(1);
        expect(formDataMock.instances[0]?.submitUrl).toBe(
            "https://s3.example.com/upload",
        );
        expect(formDataMock.instances[0]?.fields).toEqual([
            ["key", "f/123/asset.jpg"],
            ["policy", "signed-policy"],
            ["file", expect.any(Object)],
        ]);
    });

    it("uses the local file name when createAsset payload omits filename", async () => {
        const sbApi = {
            post: vi.fn().mockResolvedValue({
                data: {
                    post_url: "https://s3.example.com/upload",
                    fields: {},
                },
            }),
        };

        await createAsset(
            {
                spaceId: "12345",
                pathToFile: "./sb-mig-logo.png",
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(sbApi.post).toHaveBeenCalledWith("spaces/12345/assets/", {
            filename: "sb-mig-logo.png",
        });
    });

    it("creates and finalizes an asset upload", async () => {
        const sbApi = {
            post: vi.fn().mockResolvedValue({
                data: {
                    id: 987,
                    post_url: "https://s3.example.com/upload",
                    fields: {},
                },
            }),
            get: vi.fn().mockResolvedValue({
                data: {
                    asset: {
                        id: 987,
                        filename:
                            "https://a.storyblok.com/f/123/asset-final.jpg",
                    },
                },
            }),
        };

        const result = await createAssetAndFinalize(
            {
                spaceId: "12345",
                pathToFile: "README.md",
                payload: {
                    filename: "asset-final.jpg",
                    validate_upload: 1,
                },
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toEqual({
            id: 987,
            filename: "https://a.storyblok.com/f/123/asset-final.jpg",
        });
        expect(sbApi.post).toHaveBeenCalledWith("spaces/12345/assets/", {
            filename: "asset-final.jpg",
            validate_upload: 1,
        });
        expect(sbApi.get).toHaveBeenCalledWith(
            "spaces/12345/assets/987/finish_upload",
            {},
        );
    });

    it("normalizes direct finish_upload asset responses", async () => {
        const sbApi = {
            post: vi.fn().mockResolvedValue({
                data: {
                    id: 987,
                    post_url: "https://s3.example.com/upload",
                    fields: {},
                },
            }),
            get: vi.fn().mockResolvedValue({
                data: {
                    id: 987,
                    filename: "https://a.storyblok.com/f/123/direct.jpg",
                },
            }),
        };

        const result = await createAssetAndFinalize(
            {
                spaceId: "12345",
                pathToFile: "README.md",
                payload: {
                    filename: "direct.jpg",
                },
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toEqual({
            id: 987,
            filename: "https://a.storyblok.com/f/123/direct.jpg",
        });
    });

    it("updates asset metadata with Storyblok's asset update payload", async () => {
        const updateResponse = {
            data: {
                asset: {
                    id: 987,
                    meta_data: { alt: "Updated alt text" },
                },
            },
        };
        const sbApi = {
            put: vi.fn().mockResolvedValue(updateResponse),
        };

        const result = await updateAsset(
            {
                spaceId: "12345",
                assetId: 987,
                payload: {
                    asset_folder_id: 456,
                    internal_tag_ids: [1111],
                    is_private: true,
                    locked: false,
                    meta_data: {
                        alt: "Updated alt text",
                        title: "Updated title",
                    },
                    publish_at: "2026-05-31T11:52:00.000Z",
                },
            },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result).toBe(updateResponse.data);
        expect(sbApi.put).toHaveBeenCalledWith("spaces/12345/assets/987", {
            asset_folder_id: 456,
            internal_tag_ids: [1111],
            is_private: true,
            locked: false,
            meta_data: {
                alt: "Updated alt text",
                title: "Updated title",
            },
            publish_at: "2026-05-31T11:52:00.000Z",
        });
    });
});
