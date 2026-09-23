import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getStoryById: vi.fn(),
    getStoriesByFullSlugs: vi.fn(),
    getStoryVersions: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    publishStoryLanguages: vi.fn(),
    getSpace: vi.fn(),
    sbApiGet: vi.fn(),
    sbApiPost: vi.fn(),
    sbApiPut: vi.fn(),
    sbApiDelete: vi.fn(),
    getAllStories: vi.fn(),
    getAllComponents: vi.fn(),
    getAllAssets: vi.fn(),
    getAllInternalTags: vi.fn(),
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
        sbApi: {
            get: mocks.sbApiGet,
            post: mocks.sbApiPost,
            put: mocks.sbApiPut,
            delete: mocks.sbApiDelete,
        },
    },
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            getStoryBySlug: mocks.getStoryBySlug,
            getStoryById: mocks.getStoryById,
            getStoriesByFullSlugs: mocks.getStoriesByFullSlugs,
            getStoryVersions: mocks.getStoryVersions,
            getAllStories: mocks.getAllStories,
            createStory: mocks.createStory,
            updateStory: mocks.updateStory,
            publishStoryLanguages: mocks.publishStoryLanguages,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        spaces: {
            getSpace: mocks.getSpace,
        },
        internalTags: {
            getAllInternalTags: mocks.getAllInternalTags,
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
import Logger from "../../src/utils/logger.js";

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
        mocks.getAllInternalTags.mockResolvedValue({ internal_tags: [] });

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
            // MAR-3359: the dry-run reads the ledger and the target library,
            // so it no longer claims it could not check them. Every item is
            // still `create`: this target is empty and there is no ledger.
            limitations: ["manifests_not_written_in_dry_run"],
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
        // An asset-only run never rewrites stories, so story references keep
        // the scanner's neutral status and raise no break warnings.
        expect(
            report.graph.storyReferences.every(
                (reference: any) => reference.status === "unclassified",
            ),
        ).toBe(true);
        expect(
            report.graph.warnings.filter(
                (warning: any) => warning.code === "broken_story_reference",
            ),
        ).toEqual([]);
        expect(report.commands.apply).toBe(
            "sb-mig copy assets --from source-space --to target-space --referenced-by-stories --source blog/post --mode subtree",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3162 R4 + R7 claim layer. Mutations that must turn it red: select
    // source assets by referenced id and exact filename only (0 will copy); or
    // drop `byShape` from the dry-run report.
    // MAR-3353 R3. Mutation that must turn it red: make the dimensions segment
    // mandatory again, so the short-form URL is neither parsed nor counted.
    it("counts a short-form and a long-form URL of one file as one asset", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "short-form.json");
        const hash = "4a4ecad472";
        // The same file, written both ways: the library's own short form, and
        // a long form with a dimensions segment.
        const shortUrl = `https://a.storyblok.com/f/111/${hash}/policy.pdf`;
        const longUrl = `https://a.storyblok.com/f/111/1200x630/${hash}/policy.pdf`;
        const libraryFilename = `https://s3.amazonaws.com/a.storyblok.com/f/111/${hash}/policy.pdf`;

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? {
                          assets: [
                              {
                                  ...sourceAsset,
                                  id: 700,
                                  filename: libraryFilename,
                                  asset_folder_id: null,
                              },
                          ],
                      }
                    : { assets: [] },
            ),
        );
        mocks.getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        mocks.getStoryBySlug.mockImplementation((slug: string) =>
            Promise.resolve(
                slug === "blog/post"
                    ? {
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
                                  seo: { og_image: shortUrl },
                                  html: `<a href="${longUrl}">policy</a>`,
                              },
                          },
                      }
                    : undefined,
            ),
        );
        mocks.getAllStories.mockResolvedValue([]);
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: { seo: { type: "custom" } } },
        ]);
        mocks.getStoriesByFullSlugs.mockResolvedValue([]);
        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        mocks.sbApiGet.mockResolvedValue({
            data: { space: { languages: [] } },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "111",
                to: "222",
                source: "blog/post",
                destination: "/",
                withAssets: true,
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.graph.assetReferences).toMatchObject([
            { assetKey: `/f/111/${hash}/policy.pdf`, shape: "string" },
            {
                assetKey: `/f/111/1200x630/${hash}/policy.pdf`,
                shape: "string",
            },
        ]);
        // Two occurrences of one file: the unique count follows the hash and
        // the file name, not the shape of the URL.
        expect(report.assetReferenceSummary.byShape.string).toEqual({
            occurrences: 2,
            uniqueAssets: 1,
        });
        expect(report.summary.assets).toBe(1);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("plans an asset a story mentions only as a URL inside a string", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "string-refs.json");
        const key = "/f/111/1200x630/2b7c4d6e9a0b1c2d3e4f5a6b/flyer.pdf";
        // What the asset library answers, and what the story actually holds:
        // the same file under two different hosts.
        const libraryFilename = `https://s3.amazonaws.com/a.storyblok.com${key}`;
        const contentUrl = `https://a.storyblok.com${key}`;

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? {
                          assets: [
                              {
                                  ...sourceAsset,
                                  id: 700,
                                  filename: libraryFilename,
                                  asset_folder_id: null,
                              },
                          ],
                      }
                    : { assets: [] },
            ),
        );
        mocks.getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "blog/post") {
                return Promise.resolve({
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
                            // No asset field at all: the only mention of the
                            // file is this URL inside an SEO string.
                            seo: { og_image: contentUrl },
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.getAllStories.mockResolvedValue([]);
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: { seo: { type: "custom" } } },
        ]);
        mocks.getStoriesByFullSlugs.mockResolvedValue([]);
        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        mocks.sbApiGet.mockResolvedValue({
            data: { space: { languages: [] } },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "111",
                to: "222",
                source: "blog/post",
                destination: "/",
                withAssets: true,
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary.assets).toBe(1);
        expect(report.graph.assets).toMatchObject([
            {
                sourceId: 700,
                sourceFilename: libraryFilename,
                action: "create",
            },
        ]);
        expect(report.graph.assetReferences).toMatchObject([
            {
                filename: contentUrl,
                assetKey: key,
                shape: "string",
                path: "content.seo.og_image",
                status: "planned",
            },
        ]);
        expect(report.assetReferenceSummary.byShape).toEqual({
            object: { occurrences: 0, uniqueAssets: 0 },
            string: { occurrences: 1, uniqueAssets: 1 },
        });
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3162 lap 2 (G1). Mutation that must turn it red: drop the assetKey
    // clause from hasMappedAssetReference, so a string reference the ledger
    // already covers is reported as planned or unresolved.
    it("reports a string reference the ledger already covers as mapped", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
        const outputPath = path.join(tempDir, "plans", "mapped-string.json");
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const key = "/f/111/1200x630/2b7c4d6e9a0b1c2d3e4f5a6b/flyer.pdf";
        const libraryFilename = `https://s3.amazonaws.com/a.storyblok.com${key}`;
        const contentUrl = `https://a.storyblok.com${key}`;
        const ledgerDir = path.join(manifestRoot, "copy", "111", "222");

        await mkdir(ledgerDir, { recursive: true });
        // The ledger holds the library's host form; the story holds its own.
        await writeFile(
            path.join(ledgerDir, "manifest.jsonl"),
            JSON.stringify({
                type: "asset",
                source_space_id: "111",
                target_space_id: "222",
                action: "created",
                created_at: "2026-09-18T00:00:00.000Z",
                source_id: 700,
                target_id: 7007,
                source_filename: libraryFilename,
                target_filename:
                    "https://a.storyblok.com/f/222/1200x630/9c8d7e6f5a/flyer.pdf",
            }) + "\n",
            "utf8",
        );

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? {
                          assets: [
                              {
                                  ...sourceAsset,
                                  id: 700,
                                  filename: libraryFilename,
                                  asset_folder_id: null,
                              },
                          ],
                      }
                    : { assets: [] },
            ),
        );
        mocks.getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        mocks.getStoryBySlug.mockImplementation((slug: string) =>
            Promise.resolve(
                slug === "blog/post"
                    ? {
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
                                  seo: { og_image: contentUrl },
                              },
                          },
                      }
                    : undefined,
            ),
        );
        mocks.getAllStories.mockResolvedValue([]);
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: { seo: { type: "custom" } } },
        ]);
        mocks.getStoriesByFullSlugs.mockResolvedValue([]);
        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        mocks.sbApiGet.mockResolvedValue({
            data: { space: { languages: [] } },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "111",
                to: "222",
                source: "blog/post",
                destination: "/",
                withAssets: true,
                dryRun: true,
                manifestRoot,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.graph.assetReferences).toMatchObject([
            { assetKey: key, shape: "string", status: "mapped" },
        ]);
        expect(report.assetReferenceSummary.mapped).toEqual({
            occurrences: 1,
            uniqueAssets: 1,
        });

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
        // `quiet` rides along now (MAR-3356): the progress line owns the
        // terminal, so the API layer prints nothing per asset.
        expect(mocks.downloadAsset).toHaveBeenCalledWith(
            { payload: sourceAsset, quiet: true },
            expect.any(Object),
        );
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledWith(
            {
                quiet: true,
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
                quiet: true,
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
        // MAR-3359 R3: a ledger mapping counts as "already copied" only while
        // the target still holds what it points at, so the target listing
        // holds the three things this ledger says were copied. (It was empty
        // before only because the old apply never looked.)
        mocks.getAllAssetFolders.mockImplementation(({ spaceId }) =>
            Promise.resolve({
                asset_folders:
                    spaceId === "source-space"
                        ? sourceAssetFolders
                        : [
                              { id: 110, name: "Root", parent_id: null },
                              { id: 120, name: "Nested", parent_id: 110 },
                          ],
            }),
        );
        mocks.getAllAssets.mockImplementation(({ spaceId }) =>
            Promise.resolve({
                assets:
                    spaceId === "source-space"
                        ? [sourceAsset]
                        : [
                              {
                                  id: 220,
                                  filename:
                                      "https://a.storyblok.com/f/456/nested/image.jpg",
                                  asset_folder_id: 120,
                              },
                          ],
            }),
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

    describe("failed writes never end the run (MAR-3056)", () => {
        let tempDir: string;
        let outputPath: string;
        let exitCodeBefore: typeof process.exitCode;

        beforeEach(async () => {
            tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-assets-"));
            outputPath = path.join(tempDir, "assets-report.json");
            exitCodeBefore = process.exitCode;
            process.exitCode = undefined;
        });

        const runApply = () =>
            copyCommand({
                input: ["copy", "assets"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    all: true,
                    outputPath,
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                },
            } as any);

        const readReport = async () =>
            JSON.parse(await readFile(outputPath, "utf8"));

        const finish = async () => {
            process.exitCode = exitCodeBefore;
            await rm(tempDir, { recursive: true, force: true });
        };

        // MAR-3056 R1 canary for assets. Mutation that must turn it red: let a
        // rejected asset-folder create throw out of copyAssetsAndWriteManifests.
        it("records a failed asset-folder create, skips what lives under it, writes the report, and exits 1", async () => {
            mocks.createAssetFolder.mockImplementation(({ payload }) =>
                payload.name === "Nested"
                    ? Promise.reject({
                          status: 422,
                          message: "Name has already been taken",
                      })
                    : Promise.resolve({
                          asset_folder: {
                              id: 110,
                              name: payload.name,
                              parent_id: payload.parent_id,
                          },
                      }),
            );

            await runApply();

            expect(process.exitCode).toBe(1);
            // The asset lives in the folder that was not created.
            expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();

            const report = await readReport();

            expect(report.items).toEqual([
                expect.objectContaining({
                    resource: "asset_folder",
                    sourceId: 10,
                    targetId: 110,
                    outcome: "created",
                }),
                expect.objectContaining({
                    resource: "asset_folder",
                    sourceId: 20,
                    outcome: "create_failed",
                }),
                expect.objectContaining({
                    resource: "asset",
                    sourceId: 200,
                    outcome: "skipped_parent_failed",
                }),
            ]);
            expect(report.failures).toEqual([
                expect.objectContaining({
                    resource: "asset_folder",
                    name: "Root/Nested",
                    phase: "create",
                    status: 422,
                }),
            ]);

            await finish();
        });

        // Mutation that must turn it red: let a rejected upload throw out of
        // copyAssetsAndWriteManifests.
        it("records a failed asset upload, writes the report, and exits 1", async () => {
            mocks.createAssetAndFinalize.mockRejectedValue({
                status: 500,
                message: "Internal Server Error",
            });

            await runApply();

            expect(process.exitCode).toBe(1);

            const report = await readReport();

            expect(
                report.items.map((item: any) => [item.resource, item.outcome]),
            ).toEqual([
                ["asset_folder", "created"],
                ["asset_folder", "created"],
                ["asset", "create_failed"],
            ]);
            expect(report.failures).toEqual([
                expect.objectContaining({
                    resource: "asset",
                    name: "https://a.storyblok.com/f/123/nested/image.jpg",
                    phase: "create",
                    status: 500,
                }),
            ]);

            await finish();
        });

        // MAR-3355 R4 canary. Mutation that must turn it red: drop the
        // attempts from the failure message.
        it("says how many attempts a failed upload made", async () => {
            const { withRetry } = await import("../../src/utils/retry.js");
            // The error exactly as the retried step lets it escape: three
            // resets, the attempts marked on it by the retry itself.
            const exhausted = await withRetry(
                () =>
                    Promise.reject(
                        Object.assign(new Error("read ECONNRESET"), {
                            code: "ECONNRESET",
                        }),
                    ),
                {
                    step: "upload",
                    subject: "image.jpg",
                    onRetry: () => undefined,
                    sleep: async () => undefined,
                },
            ).catch((error) => error);

            mocks.createAssetAndFinalize.mockRejectedValue(exhausted);

            await runApply();

            expect(process.exitCode).toBe(1);

            const report = await readReport();

            expect(report.items.at(-1)).toMatchObject({
                resource: "asset",
                outcome: "create_failed",
            });
            expect(report.failures).toHaveLength(1);
            expect(report.failures[0].message).toBe(
                "Failed to copy asset 'https://a.storyblok.com/f/123/nested/image.jpg' into space 'target-space': read ECONNRESET (after 3 attempts)",
            );

            await finish();
        });
    });
});

/**
 * MAR-3359: the dry-run says what the apply will do, because both ask the
 * same decision. Every test here drives the real command and reads what a
 * person reads — the printed lines and the two JSON reports — never the
 * decision function itself.
 */
describe("copy assets: the plan is the apply's own decision (MAR-3359)", () => {
    const SOURCE = "111";
    const TARGET = "222";

    const url = (space: string, dims: string, hash: string, name: string) =>
        `https://a.storyblok.com/f/${space}/${dims}/${hash}/${name}`;

    const sourceAssetOf = (
        id: number,
        folderId: number | null,
        filename: string,
    ) => ({ id, filename, asset_folder_id: folderId });

    type World = {
        sourceFolders: any[];
        sourceAssets: any[];
        targetFolders: any[];
        targetAssets: any[];
    };

    let world: World;
    let nextTargetId: number;

    const setWorld = (next: World) => {
        world = next;
        mocks.getAllAssetFolders.mockImplementation(({ spaceId }: any) =>
            Promise.resolve({
                asset_folders:
                    spaceId === SOURCE
                        ? world.sourceFolders
                        : world.targetFolders,
            }),
        );
        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve({
                assets:
                    spaceId === SOURCE ? world.sourceAssets : world.targetAssets,
            }),
        );
    };

    const ledgerAsset = (
        sourceId: number,
        targetId: number,
        sourceFilename: string,
        targetFilename: string,
        action = "created",
    ) => ({
        type: "asset",
        source_space_id: SOURCE,
        target_space_id: TARGET,
        source_id: sourceId,
        target_id: targetId,
        source_filename: sourceFilename,
        target_filename: targetFilename,
        action,
        created_at: "2026-09-23T00:00:00.000Z",
    });

    const ledgerFolder = (sourceId: number, targetId: number) => ({
        type: "asset_folder",
        source_space_id: SOURCE,
        target_space_id: TARGET,
        source_id: sourceId,
        target_id: targetId,
        action: "created",
        created_at: "2026-09-23T00:00:00.000Z",
    });

    let tempDir: string;
    let manifestRoot: string;
    const ledgerFile = () =>
        path.join(manifestRoot, "copy", SOURCE, TARGET, "manifest.jsonl");

    const writeLedger = async (entries: unknown[]) => {
        await mkdir(path.dirname(ledgerFile()), { recursive: true });
        await writeFile(
            ledgerFile(),
            entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
            "utf8",
        );
    };

    const readLedgerLines = async (): Promise<any[]> =>
        (await readFile(ledgerFile(), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));

    const run = async (dryRun: boolean, extra: Record<string, unknown> = {}) => {
        const outputPath = path.join(
            tempDir,
            dryRun ? "dry-run.json" : "apply.json",
        );

        await copyCommand({
            input: ["copy", "assets"],
            flags: {
                from: SOURCE,
                to: TARGET,
                all: true,
                manifestRoot,
                outputPath,
                ...(dryRun ? { dryRun: true } : {}),
                ...extra,
            },
        } as any);

        return JSON.parse(await readFile(outputPath, "utf8"));
    };

    const warnings = () =>
        (Logger.warning as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
            (call) => String(call[0]),
        );

    /** What the dry-run said about one source id, and what the apply did. */
    const dryActionOf = (report: any, resource: string, sourceId: number) =>
        (resource === "asset"
            ? report.graph.assets
            : report.graph.assetFolders
        ).find((node: any) => node.sourceId === sourceId)?.action;
    const planOf = (report: any, resource: string, sourceId: number) =>
        (resource === "asset" ? report.plan.assets : report.plan.folders).find(
            (item: any) => item.sourceId === sourceId,
        );
    const appliedOutcomeOf = (
        report: any,
        resource: string,
        sourceId: number,
    ) =>
        report.items.find(
            (item: any) =>
                item.resource === resource && item.sourceId === sourceId,
        )?.outcome;
    const asDryAction = (outcome: string | undefined) =>
        outcome === "matched"
            ? "match"
            : outcome === "created"
              ? "create"
              : outcome;

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-asset-plan-"));
        manifestRoot = path.join(tempDir, ".sb-mig");
        nextTargetId = 9000;
        mocks.getAllInternalTags.mockResolvedValue({ internal_tags: [] });
        mocks.downloadAsset.mockResolvedValue("/tmp/file.jpg");
        mocks.createAssetFolder.mockImplementation(({ payload }: any) =>
            Promise.resolve({
                asset_folder: {
                    id: (nextTargetId += 1),
                    name: payload.name,
                    parent_id: payload.parent_id,
                },
            }),
        );
        mocks.createAssetAndFinalize.mockImplementation(({ payload }: any) => {
            nextTargetId += 1;

            return Promise.resolve({
                id: nextTargetId,
                filename: String(payload.filename).replace(
                    `/f/${SOURCE}/`,
                    `/f/${TARGET}/`,
                ),
                asset_folder_id: payload.asset_folder_id,
            });
        });
        mocks.updateAsset.mockResolvedValue({});
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    /**
     * The R1 fixture: a ledger mapping two assets and one folder, a target
     * library holding one more asset by unique file name and one folder by
     * path, and two assets that are nowhere yet.
     */
    const mixedWorld = async () => {
        const one = url(SOURCE, "100x100", "aaaaaaaa01", "one.jpg");
        const two = url(SOURCE, "100x100", "aaaaaaaa02", "two.jpg");
        const three = url(SOURCE, "100x100", "aaaaaaaa03", "three.jpg");
        const four = url(SOURCE, "100x100", "aaaaaaaa04", "four.jpg");
        const five = url(SOURCE, "100x100", "aaaaaaaa05", "five.jpg");

        setWorld({
            sourceFolders: [
                { id: 10, name: "Root", parent_id: null },
                { id: 20, name: "Nested", parent_id: 10 },
                { id: 30, name: "Other", parent_id: null },
            ],
            sourceAssets: [
                sourceAssetOf(201, 20, one),
                sourceAssetOf(202, 20, two),
                sourceAssetOf(203, 20, three),
                sourceAssetOf(204, 20, four),
                sourceAssetOf(205, 30, five),
            ],
            targetFolders: [
                { id: 110, name: "Root", parent_id: null },
                { id: 120, name: "Nested", parent_id: 110 },
            ],
            targetAssets: [
                {
                    id: 2201,
                    filename: url(TARGET, "100x100", "bbbbbbbb01", "one.jpg"),
                    asset_folder_id: 120,
                },
                {
                    // The ledger's copy of two.jpg, renamed in the target
                    // since; and below, an unrelated file called two.jpg.
                    // Ledger first and file name first land on different
                    // files, so the order is visible in the target ids.
                    id: 2202,
                    filename: url(
                        TARGET,
                        "100x100",
                        "bbbbbbbb02",
                        "two-renamed.jpg",
                    ),
                    asset_folder_id: 120,
                },
                {
                    id: 2299,
                    filename: url(TARGET, "100x100", "dddddddd99", "two.jpg"),
                    asset_folder_id: 110,
                },
                {
                    id: 2203,
                    filename: url(TARGET, "100x100", "bbbbbbbb03", "three.jpg"),
                    asset_folder_id: 120,
                },
            ],
        });
        await writeLedger([
            ledgerFolder(10, 110),
            ledgerAsset(
                201,
                2201,
                one,
                url(TARGET, "100x100", "bbbbbbbb01", "one.jpg"),
            ),
            ledgerAsset(
                202,
                2202,
                two,
                url(TARGET, "100x100", "bbbbbbbb02", "two-renamed.jpg"),
            ),
        ]);
    };

    // R1 canary. Mutations that must turn it red: make the dry-run plan
    // without the ledger; make the apply decide without the ledger (so it
    // looks at the file name first).
    it("says exactly what the apply then does, item by item", async () => {
        await mixedWorld();

        const dry = await run(true);
        const applied = await run(false);

        const folderIds = [10, 20, 30];
        const assetIds = [201, 202, 203, 204, 205];

        expect(
            folderIds.map((id) => dryActionOf(dry, "asset_folder", id)),
        ).toEqual(["match", "match", "create"]);
        expect(assetIds.map((id) => dryActionOf(dry, "asset", id))).toEqual([
            "match",
            "match",
            "match",
            "create",
            "create",
        ]);
        expect(
            folderIds.map((id) =>
                asDryAction(appliedOutcomeOf(applied, "asset_folder", id)),
            ),
        ).toEqual(
            folderIds.map((id) => dryActionOf(dry, "asset_folder", id)),
        );
        expect(
            assetIds.map((id) =>
                asDryAction(appliedOutcomeOf(applied, "asset", id)),
            ),
        ).toEqual(assetIds.map((id) => dryActionOf(dry, "asset", id)));
        // And the same files: every match lands where the dry-run said.
        const matchedTargets = (report: any, source: "dry" | "applied") =>
            [201, 202, 203].map((id) =>
                source === "dry"
                    ? planOf(report, "asset", id)?.targetId
                    : report.items.find(
                          (item: any) =>
                              item.resource === "asset" && item.sourceId === id,
                      )?.targetId,
            );

        expect(matchedTargets(dry, "dry")).toEqual([2201, 2202, 2203]);
        expect(matchedTargets(applied, "applied")).toEqual(
            matchedTargets(dry, "dry"),
        );
        // Two uploads and one folder, exactly what the dry-run counted.
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledTimes(2);
        expect(mocks.createAssetFolder).toHaveBeenCalledTimes(1);
    });

    // R2 canary. Mutation that must turn it red: append a ledger line during
    // the dry-run.
    it("reads the ledger and the target library, and writes nothing", async () => {
        await mixedWorld();

        const before = await readFile(ledgerFile());

        await run(true);

        expect(mocks.getAllAssets).toHaveBeenCalledWith(
            { spaceId: TARGET },
            expect.objectContaining({ spaceId: TARGET }),
        );
        expect(mocks.getAllAssetFolders).toHaveBeenCalledWith(
            { spaceId: TARGET },
            expect.objectContaining({ spaceId: TARGET }),
        );
        expect(mocks.createAsset).not.toHaveBeenCalled();
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();
        expect(mocks.createAssetFolder).not.toHaveBeenCalled();
        expect(mocks.updateAsset).not.toHaveBeenCalled();
        expect(mocks.downloadAsset).not.toHaveBeenCalled();
        expect(mocks.sbApiPost).not.toHaveBeenCalled();
        expect(mocks.sbApiPut).not.toHaveBeenCalled();
        expect(mocks.sbApiDelete).not.toHaveBeenCalled();
        expect(Buffer.compare(await readFile(ledgerFile()), before)).toBe(0);
    });

    // R3 canary. Mutation that must turn it red: trust a ledger mapping
    // without checking that the target still holds it.
    it("uploads again what the ledger maps to a file the target no longer holds", async () => {
        const seven = url(SOURCE, "100x100", "aaaaaaaa07", "seven.jpg");

        setWorld({
            sourceFolders: [],
            sourceAssets: [sourceAssetOf(7, null, seven)],
            targetFolders: [],
            // 70 was copied once, then deleted in the target by hand.
            targetAssets: [],
        });
        await writeLedger([
            ledgerAsset(7, 70, seven, url(TARGET, "100x100", "cccc", "seven.jpg")),
        ]);

        const dry = await run(true);

        expect(planOf(dry, "asset", 7)).toMatchObject({
            action: "create",
            via: "stale_ledger",
            staleReason: "deleted_in_target",
        });
        expect(dry.summary).toMatchObject({
            assetsStaleInLedger: 1,
            assetsAlreadyCopied: 0,
        });

        await run(false);

        // Uploaded again, never a metadata write to the missing 70.
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledTimes(1);
        expect(
            mocks.updateAsset.mock.calls.map((call) => call[0].assetId),
        ).not.toContain(70);

        const { buildCopyMaps, loadManifest } = await import(
            "../../src/api/copy/index.js"
        );
        const maps = buildCopyMaps(await loadManifest(ledgerFile()));

        // The new line supersedes the stale one: a rerun maps 7 to the new copy.
        expect(maps.assetIds.get(7)?.id).toBe(nextTargetId);
        expect(nextTargetId).not.toBe(70);
    });

    /**
     * The Hult shape: one photo name at two crops, in two folders. A was
     * uploaded; B must never be "matched" to A's copy by file name.
     */
    const hultWorld = ({
        sourceAssets,
        bCrop = "1307x1963",
    }: {
        sourceAssets: "A and B" | "B only";
        /** B's dimensions segment; Hult's B is a smaller crop of A. */
        bCrop?: string;
    }) => {
        const a = url(SOURCE, "6336x9520", "e2c0000001", "do01001801.jpg");
        const b = url(SOURCE, bCrop, "0960000002", "do01001801.jpg");
        const t1 = url(TARGET, "6336x9520", "f000000001", "do01001801.jpg");

        setWorld({
            sourceFolders: [
                { id: 1, name: "F1", parent_id: null },
                { id: 2, name: "F2", parent_id: null },
            ],
            sourceAssets:
                sourceAssets === "A and B"
                    ? [sourceAssetOf(501, 1, a), sourceAssetOf(502, 2, b)]
                    : [sourceAssetOf(502, 2, b)],
            targetFolders: [
                { id: 11, name: "F1", parent_id: null },
                { id: 12, name: "F2", parent_id: null },
            ],
            targetAssets: [{ id: 7001, filename: t1, asset_folder_id: 11 }],
        });

        return { a, b, t1 };
    };

    // R7 (a) canary. Mutation that must turn it red: drop the "claimed by
    // another source" check.
    it("never matches a file to the copy another source already owns", async () => {
        // B at the SAME crop as A: the dimensions cannot tell them apart, so
        // only the claim can keep B off A's copy.
        const { a, t1 } = hultWorld({
            sourceAssets: "A and B",
            bCrop: "6336x9520",
        });

        await writeLedger([
            ledgerFolder(1, 11),
            ledgerFolder(2, 12),
            ledgerAsset(501, 7001, a, t1),
        ]);

        const dry = await run(true);

        expect(planOf(dry, "asset", 501)).toMatchObject({
            action: "match",
            via: "ledger",
        });
        // B shares A's file name and size; A's claim alone rules it out.
        expect(planOf(dry, "asset", 502)).toMatchObject({ action: "create" });
        expect(planOf(dry, "asset", 502).via).toBeUndefined();
    });

    // R7 (b) canary. Mutation that must turn it red: drop the dimensions
    // check. Here the ledger holds no line for A, so the claim cannot help.
    it("never matches a file cropped to other dimensions", async () => {
        hultWorld({ sourceAssets: "B only" });

        const dry = await run(true);

        expect(planOf(dry, "asset", 502)).toMatchObject({ action: "create" });
        expect(dry.summary).toMatchObject({
            assetsFoundInTarget: 0,
            assetsToUpload: 1,
        });
    });

    // R7 (c) canary. Mutations that must turn it red: drop the "claimed by
    // another source" check, or trust a ledger line without it.
    it("heals a ledger line that matched another source's copy", async () => {
        const { a, b, t1 } = hultWorld({ sourceAssets: "A and B" });

        await writeLedger([
            ledgerFolder(1, 11),
            ledgerFolder(2, 12),
            ledgerAsset(501, 7001, a, t1),
            // What the Hult resume wrote: B "matched" A's copy by file name.
            ledgerAsset(502, 7001, b, t1, "matched_by_target_key"),
        ]);

        const dry = await run(true);

        expect(planOf(dry, "asset", 502)).toMatchObject({
            action: "create",
            via: "stale_ledger",
            staleReason: "claimed_by_another_source",
        });
        expect(planOf(dry, "asset", 501)).toMatchObject({
            action: "match",
            via: "ledger",
        });
        expect(
            warnings().some((line) =>
                line.includes("stale in ledger: claimed by another source"),
            ),
        ).toBe(true);

        await run(false);

        // B is uploaded into its own folder, and its new line supersedes
        // the bad one.
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledTimes(1);
        expect(mocks.createAssetAndFinalize.mock.calls[0][0]).toMatchObject({
            payload: { filename: b, asset_folder_id: 12 },
        });

        const lastLineForB = (await readLedgerLines())
            .filter((entry) => entry.type === "asset" && entry.source_id === 502)
            .pop();

        expect(lastLineForB).toMatchObject({
            target_id: nextTargetId,
            action: "created",
        });
    });

    // R4 canary. Mutation that must turn it red: count every item as a
    // planned create.
    it("says the plan in seven numbers, the same in the log and the report", async () => {
        await mixedWorld();

        const dry = await run(true);
        const line = warnings().find((entry) =>
            entry.startsWith("[dry-run] assets: "),
        );

        expect(line).toBe(
            "[dry-run] assets: 2 already copied (ledger), 1 found in target, 2 will upload, 0 stale in ledger (will upload again); folders: 1 already copied, 1 found in target, 1 will create",
        );
        expect(dry.summary).toMatchObject({
            assetsAlreadyCopied: 2,
            assetsFoundInTarget: 1,
            assetsToUpload: 2,
            assetsStaleInLedger: 0,
            foldersAlreadyCopied: 1,
            foldersFoundInTarget: 1,
            foldersToCreate: 1,
            plannedCreates: 3,
        });
        expect(
            dry.summary.assetsAlreadyCopied +
                dry.summary.assetsFoundInTarget +
                dry.summary.assetsToUpload +
                dry.summary.assetsStaleInLedger,
        ).toBe(dry.summary.assets);
        expect(
            dry.summary.foldersAlreadyCopied +
                dry.summary.foldersFoundInTarget +
                dry.summary.foldersToCreate,
        ).toBe(dry.summary.assetFolders);
        // The line comes before any per-item line.
        const lines = warnings();

        expect(lines.indexOf(String(line))).toBeLessThan(
            lines.findIndex((entry) => entry.startsWith("[dry-run]   ")),
        );
        expect(dry.limitations).not.toContain(
            "target_asset_identity_not_resolved",
        );
    });

    // R5 canary. Mutation that must turn it red: never print the ledger line.
    it("says it is resuming from a ledger, and only when there is one", async () => {
        await mixedWorld();

        await run(true);

        const ledgerLines = () =>
            warnings().filter((line) => line.includes("ledger: "));

        expect(ledgerLines()).toEqual([
            expect.stringMatching(
                /^\[dry-run\] ledger: 3 entries loaded from .*manifest\.jsonl \(resuming;/,
            ),
        ]);

        vi.mocked(Logger.warning).mockClear();
        await run(false);

        expect(ledgerLines()).toEqual([
            expect.stringMatching(/^ledger: 3 entries loaded from /),
        ]);

        await rm(ledgerFile());
        vi.mocked(Logger.warning).mockClear();
        await run(true);

        expect(ledgerLines()).toEqual([]);
    });
});
