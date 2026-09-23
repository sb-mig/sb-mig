import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

const formDataMock = vi.hoisted(() => ({
    instances: [] as Array<{
        fields: Array<[string, unknown]>;
        submitUrl?: string;
    }>,
    statusCode: 204,
    /**
     * MAR-3355 error hook: what the next submits fail with, in order. An
     * `Error` is a socket failure; a number is an S3 status. Empty means the
     * submit answers `statusCode`.
     */
    failures: [] as Array<Error | number>,
}));

const httpsMock = vi.hoisted(() => ({
    /** What each `https.get` does, in order: a socket error or a status. */
    plan: [] as Array<Error | number>,
    calls: 0,
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

            const failure = formDataMock.failures.shift();

            if (failure instanceof Error) {
                callback(failure);
                return;
            }

            callback(null, {
                statusCode:
                    typeof failure === "number"
                        ? failure
                        : formDataMock.statusCode,
            });
        }
    }

    return { default: MockFormData };
});

vi.mock("https", async () => {
    const { EventEmitter } = await import("events");
    const { Readable } = await import("stream");

    return {
        default: {
            get: (_url: string, onResponse: (response: any) => void) => {
                httpsMock.calls += 1;

                const request = new EventEmitter();
                const step = httpsMock.plan.shift() ?? 200;

                setImmediate(() => {
                    if (step instanceof Error) {
                        request.emit("error", step);
                        return;
                    }

                    const response: any = Readable.from([
                        Buffer.from("file bytes"),
                    ]);

                    response.statusCode = step;
                    onResponse(response);
                });

                return request;
            },
        },
    };
});

// The 1 s and 3 s pauses between attempts are real time; the tests take none.
vi.mock("../../src/utils/async-utils.js", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    delay: vi.fn(async () => undefined),
}));

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
    downloadAsset,
    finishAssetUpload,
    getAllAssets,
    getAllAssetFolders,
    updateAsset,
} from "../../src/api/assets/index.js";
import { managementApi } from "../../src/api/managementApi.js";
import Logger from "../../src/utils/logger.js";
import {
    errorCodeOf,
    errorStatusOf,
    isTransientError,
    retryAttemptsOf,
} from "../../src/utils/retry.js";

describe("Assets API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        formDataMock.instances.length = 0;
        formDataMock.statusCode = 204;
        formDataMock.failures.length = 0;
        httpsMock.plan.length = 0;
        httpsMock.calls = 0;
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

        expect(result).toEqual(response.data);
        expect(sbApi.get).toHaveBeenCalledWith("spaces/12345/asset_folders/", {
            search: "Images",
            with_parent: "0",
            by_ids: "42,43",
            by_uuids: "uuid-a,uuid-b",
            per_page: 100,
            page: 1,
        });
    });

    it("retrieves all paginated assets", async () => {
        const pageOneAssets = Array.from({ length: 100 }, (_, index) => ({
            id: index + 1,
            filename: `https://a.storyblok.com/f/123/image-${index + 1}.jpg`,
        }));
        const pageTwoAssets = [
            {
                id: 101,
                filename: "https://a.storyblok.com/f/123/image-101.jpg",
            },
        ];
        const sbApi = {
            get: vi
                .fn()
                .mockResolvedValueOnce({
                    data: { assets: pageOneAssets },
                    total: 101,
                    perPage: 100,
                })
                .mockResolvedValueOnce({
                    data: { assets: pageTwoAssets },
                    total: 101,
                    perPage: 100,
                }),
        };

        const result = await getAllAssets(
            { spaceId: "12345", search: "image" },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result.assets).toHaveLength(101);
        expect(result.assets.at(0)).toEqual(pageOneAssets[0]);
        expect(result.assets.at(-1)).toEqual(pageTwoAssets[0]);
        expect(sbApi.get).toHaveBeenNthCalledWith(1, "spaces/12345/assets/", {
            search: "image",
            per_page: 100,
            page: 1,
        });
        expect(sbApi.get).toHaveBeenNthCalledWith(2, "spaces/12345/assets/", {
            search: "image",
            per_page: 100,
            page: 2,
        });
    });

    it("retrieves all paginated asset folders", async () => {
        const pageOneFolders = Array.from({ length: 100 }, (_, index) => ({
            id: index + 1,
            name: `Folder ${index + 1}`,
            parent_id: null,
        }));
        const pageTwoFolders = [
            {
                id: 101,
                name: "Folder 101",
                parent_id: null,
            },
        ];
        const sbApi = {
            get: vi
                .fn()
                .mockResolvedValueOnce({
                    data: { asset_folders: pageOneFolders },
                    total: 101,
                    perPage: 100,
                })
                .mockResolvedValueOnce({
                    data: { asset_folders: pageTwoFolders },
                    total: 101,
                    perPage: 100,
                }),
        };

        const result = await getAllAssetFolders(
            { spaceId: "12345" },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(result.asset_folders).toHaveLength(101);
        expect(result.asset_folders.at(0)).toEqual(pageOneFolders[0]);
        expect(result.asset_folders.at(-1)).toEqual(pageTwoFolders[0]);
        expect(sbApi.get).toHaveBeenNthCalledWith(
            1,
            "spaces/12345/asset_folders/",
            {
                per_page: 100,
                page: 1,
            },
        );
        expect(sbApi.get).toHaveBeenNthCalledWith(
            2,
            "spaces/12345/asset_folders/",
            {
                per_page: 100,
                page: 2,
            },
        );
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

    // MAR-3356 R4 canary. Mutation that must turn it red: print the per-asset
    // lines whatever the caller asked, so a progress line cannot own the row.
    it("says its two lines by default and nothing when the caller asks for quiet", async () => {
        const sbApi = {
            put: vi.fn().mockResolvedValue({ data: { asset: { id: 987 } } }),
        };
        const args = {
            spaceId: "12345",
            assetId: 987,
            payload: { meta_data: { alt: "a" } },
        };

        await updateAsset(args, { spaceId: "12345", sbApi: sbApi as any });

        // Today's behaviour for every caller that asks for nothing.
        expect(Logger.log).toHaveBeenCalledWith(
            "Trying to update asset with id 987.",
        );
        expect(Logger.success).toHaveBeenCalledWith(
            "Asset '987' has been updated.",
        );

        vi.clearAllMocks();

        await updateAsset(
            { ...args, quiet: true },
            { spaceId: "12345", sbApi: sbApi as any },
        );

        expect(Logger.log).not.toHaveBeenCalled();
        expect(Logger.success).not.toHaveBeenCalled();
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

    describe("a transient failure is retried, one step at a time (MAR-3355)", () => {
        const socketError = (code: string) =>
            Object.assign(new Error(`read ${code}`), { code });
        /** What storyblok-js-client RESOLVES with when a request got no answer. */
        const unanswered = (code: string) => ({
            message: Object.assign(new TypeError("fetch failed"), {
                cause: socketError(code),
            }),
        });
        const signed = {
            data: {
                id: 987,
                post_url: "https://s3.example.com/upload",
                fields: { key: "f/123/photo.jpg", policy: "p" },
            },
        };
        const finished = {
            data: {
                id: 987,
                filename: "https://a.storyblok.com/f/123/photo.jpg",
            },
        };
        const sbApiOf = (overrides: Record<string, unknown> = {}) => ({
            post: vi.fn().mockResolvedValue(signed),
            get: vi.fn().mockResolvedValue(finished),
            ...overrides,
        });
        const create = (sbApi: any) =>
            createAssetAndFinalize(
                {
                    spaceId: "12345",
                    pathToFile: "README.md",
                    payload: { filename: "photo.jpg" },
                    quiet: true,
                },
                { spaceId: "12345", sbApi },
            );
        const retryLines = () =>
            vi
                .mocked(Logger.warning)
                .mock.calls.map((call) => String(call[0]))
                .filter((line) => line.startsWith("retrying "));

        // R2 canary. Mutation that must turn it red: retry the whole
        // createAssetAndFinalize, so a failed upload asks for a new record.
        it("uploads again to the same signed URL after a reset, never asking for a second record", async () => {
            const sbApi = sbApiOf();

            formDataMock.failures.push(socketError("ECONNRESET"));

            await expect(create(sbApi)).resolves.toMatchObject({ id: 987 });
            expect(sbApi.post).toHaveBeenCalledTimes(1);
            expect(formDataMock.instances).toHaveLength(2);
            // The same signed URL and the same fields, both times.
            expect(formDataMock.instances.map((form) => form.submitUrl)).toEqual([
                "https://s3.example.com/upload",
                "https://s3.example.com/upload",
            ]);
            expect(formDataMock.instances[1]!.fields.slice(0, 2)).toEqual(
                formDataMock.instances[0]!.fields.slice(0, 2),
            );
            expect(retryLines()).toEqual([
                "retrying upload for 'README.md' (1/2) after read ECONNRESET",
            ]);
        });

        // R2 canary. Mutation that must turn it red: retry the whole chain.
        it("fails once after three uploads, still with one signed-URL request", async () => {
            const sbApi = sbApiOf();

            formDataMock.failures.push(
                socketError("ECONNRESET"),
                socketError("ECONNRESET"),
                socketError("ECONNRESET"),
            );

            const error = await create(sbApi).catch((e) => e);

            expect(error.code).toBe("ECONNRESET");
            expect(retryAttemptsOf(error)).toBe(3);
            expect(sbApi.post).toHaveBeenCalledTimes(1);
            expect(formDataMock.instances).toHaveLength(3);
            expect(sbApi.get).not.toHaveBeenCalled();
        });

        // R2/R3 canary. Mutation that must turn it red: retry the signed-URL
        // POST on a socket error, or swallow its error again.
        it("never posts twice when the signed-URL answer was lost", async () => {
            const sbApi = sbApiOf({
                post: vi.fn().mockResolvedValue(unanswered("ECONNRESET")),
            });

            const error = await create(sbApi).catch((e) => e);

            expect(sbApi.post).toHaveBeenCalledTimes(1);
            expect(formDataMock.instances).toHaveLength(0);
            expect(errorCodeOf(error)).toBe("ECONNRESET");
            expect(isTransientError(error)).toBe(true);
            expect(retryLines()).toEqual([]);
        });

        it("asks for the signed URL again when the server refused it (429)", async () => {
            const sbApi = sbApiOf({
                post: vi
                    .fn()
                    .mockRejectedValueOnce({ message: "Too many", status: 429 })
                    .mockResolvedValueOnce(signed),
            });

            await expect(create(sbApi)).resolves.toMatchObject({ id: 987 });
            expect(sbApi.post).toHaveBeenCalledTimes(2);
            expect(retryLines()).toEqual([
                "retrying signed-URL request for 'photo.jpg' (1/2) after Too many",
            ]);
        });

        it("finishes again after a lost answer — finishing twice is harmless", async () => {
            const sbApi = sbApiOf({
                get: vi
                    .fn()
                    .mockResolvedValueOnce(unanswered("ETIMEDOUT"))
                    .mockResolvedValueOnce(finished),
            });

            await expect(create(sbApi)).resolves.toMatchObject({ id: 987 });
            expect(sbApi.get).toHaveBeenCalledTimes(2);
            expect(sbApi.post).toHaveBeenCalledTimes(1);
        });

        describe("errors keep their shape (R3)", () => {
            let workDir: string;
            const download = () =>
                downloadAsset(
                    {
                        payload: {
                            filename:
                                "https://a.storyblok.com/f/123/1200x800/abc/photo.jpg",
                        } as any,
                        quiet: true,
                    },
                    { sbmigWorkingDirectory: workDir } as any,
                );

            beforeEach(async () => {
                workDir = await mkdtemp(path.join(tmpdir(), "sb-mig-dl-"));
            });

            afterEach(async () => {
                await rm(workDir, { recursive: true, force: true });
            });

            // R3 canary. Mutation that must turn it red: reject the bare
            // string "error" from the download again.
            it("the download fails with the real socket error, after three tries", async () => {
                httpsMock.plan.push(
                    socketError("ECONNRESET"),
                    socketError("ECONNRESET"),
                    socketError("ECONNRESET"),
                );

                const error = await download().catch((e) => e);

                expect(errorCodeOf(error)).toBe("ECONNRESET");
                expect(isTransientError(error)).toBe(true);
                expect(retryAttemptsOf(error)).toBe(3);
                expect(httpsMock.calls).toBe(3);
            });

            it("the download recovers from one reset", async () => {
                httpsMock.plan.push(socketError("ECONNRESET"), 200);

                await expect(download()).resolves.toBe(
                    path.join(workDir, "downloadedAssets", "photo.jpg"),
                );
                expect(httpsMock.calls).toBe(2);
            });

            it("a missing source file is a refusal with its status, not a saved error page", async () => {
                httpsMock.plan.push(404);

                const error = await download().catch((e) => e);

                expect(errorStatusOf(error)).toBe(404);
                expect(isTransientError(error)).toBe(false);
                expect(httpsMock.calls).toBe(1);
            });

            it("a refused signed-URL request keeps its status and is not retried", async () => {
                const sbApi = sbApiOf({
                    post: vi.fn().mockRejectedValue({
                        message: "Unprocessable",
                        status: 422,
                        response: { status: 422 },
                    }),
                });

                const error = await create(sbApi).catch((e) => e);

                expect(errorStatusOf(error)).toBe(422);
                expect(isTransientError(error)).toBe(false);
                expect(sbApi.post).toHaveBeenCalledTimes(1);
            });

            it("an S3 answer other than 204 carries its status", async () => {
                const sbApi = sbApiOf();

                formDataMock.failures.push(403);

                const error = await create(sbApi).catch((e) => e);

                expect(error).toBeInstanceOf(Error);
                expect(errorStatusOf(error)).toBe(403);
                expect(isTransientError(error)).toBe(false);
                expect(formDataMock.instances).toHaveLength(1);
            });

            it("an S3 503 is asked again", async () => {
                const sbApi = sbApiOf();

                formDataMock.failures.push(503);

                await expect(create(sbApi)).resolves.toMatchObject({ id: 987 });
                expect(formDataMock.instances).toHaveLength(2);
            });
        });
    });
});
