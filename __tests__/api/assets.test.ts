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

import { createAsset, updateAsset } from "../../src/api/assets/index.js";
import { managementApi } from "../../src/api/managementApi.js";

describe("Assets API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        formDataMock.instances.length = 0;
        formDataMock.statusCode = 204;
    });

    it("exposes createAsset and updateAsset through managementApi.assets", () => {
        expect(managementApi.assets.createAsset).toBe(createAsset);
        expect(managementApi.assets.updateAsset).toBe(updateAsset);
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
