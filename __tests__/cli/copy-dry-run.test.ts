import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    getStoryVersions: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    publishStoryLanguages: vi.fn(),
    getAllComponents: vi.fn(),
    getSpace: vi.fn(),
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
    createAssetFolder: vi.fn(),
    createAssetAndFinalize: vi.fn(),
    downloadAsset: vi.fn(),
    updateAsset: vi.fn(),
    createTree: vi.fn(),
    traverseAndCreate: vi.fn(),
    sbApiGet: vi.fn(),
    askYesNo: vi.fn(),
}));

vi.mock("../../src/cli/helpers.js", () => ({
    askYesNo: mocks.askYesNo,
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "default-space",
        sbApi: {
            get: mocks.sbApiGet,
        },
    },
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            getStoryById: mocks.getStoryById,
            getStoryBySlug: mocks.getStoryBySlug,
            getAllStories: mocks.getAllStories,
            getStoryVersions: mocks.getStoryVersions,
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
        assets: {
            getAllAssets: mocks.getAllAssets,
            getAllAssetFolders: mocks.getAllAssetFolders,
            createAssetFolder: mocks.createAssetFolder,
            createAssetAndFinalize: mocks.createAssetAndFinalize,
            downloadAsset: mocks.downloadAsset,
            updateAsset: mocks.updateAsset,
        },
    },
}));

vi.mock("../../src/api/stories/tree.js", () => ({
    createTree: mocks.createTree,
    traverseAndCreate: mocks.traverseAndCreate,
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

/** Every line the PLAN block printed, in order. */
const planGateLines = () =>
    (Logger.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
    );

describe("copy stories dry-run", () => {
    const sourceAsset = {
        id: 300,
        filename:
            "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
        asset_folder_id: 30,
    };
    const sourceAssetFolders = [
        {
            id: 20,
            name: "Images",
            parent_id: null,
        },
        {
            id: 30,
            name: "Nested",
            parent_id: 20,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
        mocks.publishStoryLanguages.mockResolvedValue({ ok: true });
        mocks.sbApiGet.mockResolvedValue({
            data: {
                space: {
                    languages: [],
                },
            },
        });
        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "blog") {
                return Promise.resolve({
                    story: {
                        id: 1,
                        name: "Blog",
                        slug: "blog",
                        full_slug: "blog",
                        is_folder: true,
                        parent_id: 0,
                        uuid: "source-blog-uuid",
                        content: {
                            component: "page",
                            image: {
                                id: 300,
                                filename:
                                    "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                            },
                            cta: {
                                linktype: "story",
                                id: 2,
                            },
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });

        mocks.getAllStories.mockResolvedValue([
            {
                story: {
                    id: 2,
                    name: "Post 1",
                    slug: "post-1",
                    full_slug: "blog/post-1",
                    is_folder: false,
                    parent_id: 1,
                    uuid: "source-post-uuid",
                    content: {
                        component: "page",
                        body: {
                            type: "doc",
                            content: [
                                {
                                    type: "link",
                                    attrs: {
                                        linktype: "story",
                                        uuid: "source-blog-uuid",
                                    },
                                },
                            ],
                        },
                    },
                },
            },
        ]);

        mocks.createTree.mockImplementation((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [
                    {
                        id: stories[1].id,
                        story: stories[1],
                        children: [],
                    },
                ],
            },
        ]);
        mocks.createStory.mockImplementation((content: any) => {
            if (content.slug === "blog") {
                return Promise.resolve({
                    story: {
                        id: 1001,
                        uuid: "target-blog-uuid",
                        full_slug: "imported/blog",
                    },
                });
            }

            return Promise.resolve({
                story: {
                    id: 1002,
                    uuid: "target-post-uuid",
                    full_slug: "imported/blog/post-1",
                },
            });
        });
        mocks.getAllComponents.mockResolvedValue([
            {
                name: "page",
                schema: {
                    image: {
                        type: "asset",
                    },
                    cta: {
                        type: "multilink",
                    },
                    body: {
                        type: "richtext",
                    },
                },
            },
        ]);
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
        mocks.createAssetFolder.mockImplementation(({ payload }) =>
            Promise.resolve({
                asset_folder: {
                    id: payload.name === "Images" ? 120 : 130,
                    name: payload.name,
                    parent_id: payload.parent_id,
                },
            }),
        );
        mocks.downloadAsset.mockResolvedValue("/tmp/source-image.jpg");
        mocks.createAssetAndFinalize.mockResolvedValue({
            id: 900,
            filename: "https://a.storyblok.com/f/target/image.jpg",
            asset_folder_id: 130,
        });
        mocks.updateStory.mockResolvedValue({ ok: true });
        mocks.getSpace.mockResolvedValue({
            space: { languages: [{ code: "de" }, { code: "pl" }] },
        });
    });

    it("plans selected stories without creating them", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
        } as any);

        expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
            "imported",
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
            "blog",
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
            "imported/blog",
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
            "imported/blog/post-1",
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.getAllStories).toHaveBeenCalledWith(
            {
                options: {
                    starts_with: "blog/",
                },
            },
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.traverseAndCreate).not.toHaveBeenCalled();

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            schemaVersion: 1,
            command: "copy stories",
            dryRun: true,
            input: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
            normalized: {
                sourceSpaceId: "source-space",
                targetSpaceId: "target-space",
                source: "blog",
                destination: "imported",
                mode: "subtree",
            },
            summary: {
                plannedCreates: 2,
                folders: 1,
                stories: 1,
                conflicts: 0,
                errors: 0,
            },
            items: [
                {
                    type: "folder",
                    sourceFullSlug: "blog",
                    targetFullSlug: "imported/blog",
                    action: "create",
                },
                {
                    type: "story",
                    sourceFullSlug: "blog/post-1",
                    targetFullSlug: "imported/blog/post-1",
                    action: "create",
                },
            ],
            limitations: [
                "create_or_match",
                "target_state_may_change",
                "assets_not_copied_by_story_command",
                "asset_rewrite_requires_existing_asset_manifest",
            ],
        });
        expect(report.commands.apply).toBe(
            "sb-mig copy stories --from source-space --to target-space --source blog --mode subtree --destination imported",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("scans only planned stories in children mode, never the excluded root", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                mode: "children",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.items).toMatchObject([
            {
                type: "story",
                sourceFullSlug: "blog/post-1",
                targetFullSlug: "imported/post-1",
            },
        ]);
        // The root folder `blog` is fetched but not copied. Its own cta -> post-1
        // reference must not be scanned: it would inflate the relink count for
        // a story this run never writes.
        expect(
            report.graph.storyReferences.map(
                (reference: any) => reference.sourceStoryFullSlug,
            ),
        ).toEqual(["blog/post-1", "blog/post-1"]);
        expect(report.graph.storyReferences).toMatchObject([
            { path: "parent_id", status: "will_relink" },
            {
                path: "content.body.content[0].attrs.uuid",
                referencedStoryUuid: "source-blog-uuid",
                status: "will_break",
            },
        ]);
        expect(report.summary).toMatchObject({
            storyReferences: 2,
            storyReferencesWillRelink: 1,
            storyReferencesWillBreak: 1,
            storyReferencesExternalKept: 0,
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("flags source components missing from the target space during story dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        // The target space (getAllComponents mock) only knows 'page'; this post
        // nests a component that does not exist there.
        mocks.getAllStories.mockResolvedValue([
            {
                story: {
                    id: 2,
                    name: "Post 1",
                    slug: "post-1",
                    full_slug: "blog/post-1",
                    is_folder: false,
                    parent_id: 1,
                    uuid: "source-post-uuid",
                    content: {
                        component: "page",
                        body: [
                            {
                                component: "sb-content-group",
                                _uid: "blok-1",
                            },
                        ],
                    },
                },
            },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary.componentIssues).toBe(1);
        expect(report.componentCompatibility).toMatchObject({
            checked: true,
            missingComponents: ["sb-content-group"],
        });
        expect(report.componentCompatibility.findings).toMatchObject([
            {
                component: "sb-content-group",
                reason: "missing_in_target",
                sourceFullSlug: "blog/post-1",
                uid: "blok-1",
                field: "body",
                parentComponent: "page",
            },
        ]);
        expect(report.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "component_missing_in_target",
                }),
            ]),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("reports asset references already mapped by manifests during story dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestDirectory, { recursive: true });
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            JSON.stringify({
                type: "asset",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 300,
                target_id: 900,
                source_filename:
                    "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                target_filename: "https://a.storyblok.com/f/target/image.jpg",
                action: "created",
                created_at: "2026-06-24T10:00:00.000Z",
            }) + "\n",
            "utf8",
        );

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
                manifestRoot,
            },
        } as any);

        expect(mocks.getAllAssets).not.toHaveBeenCalled();
        expect(mocks.getAllAssetFolders).not.toHaveBeenCalled();

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary).toMatchObject({
            assetReferences: 1,
            assetReferencesMapped: 1,
            assetReferencesPlanned: 0,
            assetReferencesUnresolved: 0,
            assetsMapped: 0,
            assetsToCopy: 0,
        });
        expect(report.graph.assetReferences).toMatchObject([
            {
                assetId: 300,
                filename:
                    "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                status: "mapped",
            },
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("plans referenced assets when copying stories with assets", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                withAssets: true,
                dryRun: true,
                outputPath,
            },
        } as any);

        expect(mocks.getAllComponents).toHaveBeenCalledWith(
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.getAllAssets).toHaveBeenCalledWith(
            { spaceId: "source-space" },
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.getAllAssetFolders).toHaveBeenCalledWith(
            { spaceId: "source-space" },
            expect.objectContaining({ spaceId: "source-space" }),
        );
        expect(mocks.createAssetFolder).not.toHaveBeenCalled();
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();
        expect(mocks.createStory).not.toHaveBeenCalled();

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            schemaVersion: 1,
            command: "copy stories",
            dryRun: true,
            normalized: {
                sourceSpaceId: "source-space",
                targetSpaceId: "target-space",
                source: "blog",
                destination: "imported",
                mode: "subtree",
                withAssets: true,
            },
            summary: {
                plannedCreates: 2,
                assetFolders: 2,
                assets: 1,
                assetReferences: 1,
                // parent_id 0 (the space root) is not a story reference: blog
                // -> post-1, post-1 -> blog, and post-1's parent_id.
                storyReferences: 3,
                storyReferencesWillRelink: 3,
                storyReferencesWillBreak: 0,
                storyReferencesExternalKept: 0,
                storyReferencesUnresolved: 0,
                errors: 0,
            },
            graph: {
                scope: {
                    command: "copy stories",
                    withAssets: true,
                },
                assetFolders: [
                    {
                        sourceId: 20,
                        sourcePath: "Images",
                        action: "create",
                    },
                    {
                        sourceId: 30,
                        sourcePath: "Images/Nested",
                        action: "create",
                    },
                ],
                assets: [
                    {
                        sourceId: 300,
                        sourceFilename:
                            "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                        sourceAssetFolderId: 30,
                        action: "create",
                    },
                ],
                assetReferences: [
                    {
                        assetId: 300,
                        filename:
                            "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                        path: "content.image",
                        status: "planned",
                    },
                ],
            },
            assetReferenceSummary: {
                mapped: {
                    occurrences: 0,
                    uniqueAssets: 0,
                },
                planned: {
                    occurrences: 1,
                    uniqueAssets: 1,
                },
                unresolved: {
                    occurrences: 0,
                    uniqueAssets: 0,
                },
                foreignAssetSpaces: [],
            },
            limitations: [
                "create_or_match",
                "target_state_may_change",
                "target_asset_identity_not_resolved_until_apply",
            ],
        });
        expect(report.commands.apply).toBe(
            "sb-mig copy stories --from source-space --to target-space --source blog --mode subtree --destination imported --with-assets",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("marks referenced with-assets assets as manifest matches during dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestDirectory, { recursive: true });
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            [
                JSON.stringify({
                    type: "asset_folder",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 20,
                    target_id: 120,
                    action: "created",
                    created_at: "2026-06-24T10:00:00.000Z",
                }),
                JSON.stringify({
                    type: "asset_folder",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 30,
                    target_id: 130,
                    action: "created",
                    created_at: "2026-06-24T10:00:00.000Z",
                }),
                JSON.stringify({
                    type: "asset",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 300,
                    target_id: 900,
                    source_filename:
                        "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                    target_filename:
                        "https://a.storyblok.com/f/target/image.jpg",
                    action: "created",
                    created_at: "2026-06-24T10:00:00.000Z",
                }),
            ].join("\n") + "\n",
            "utf8",
        );

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                withAssets: true,
                dryRun: true,
                outputPath,
                manifestRoot,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary).toMatchObject({
            assetReferencesMapped: 1,
            assetReferencesPlanned: 0,
            assetsMapped: 1,
            assetsToCopy: 0,
        });
        expect(report.assetReferenceSummary).toMatchObject({
            mapped: {
                occurrences: 1,
                uniqueAssets: 1,
            },
            planned: {
                occurrences: 0,
                uniqueAssets: 0,
            },
            unresolved: {
                occurrences: 0,
                uniqueAssets: 0,
            },
            foreignAssetSpaces: [],
        });
        expect(report.graph.assets).toMatchObject([
            {
                sourceId: 300,
                targetFilename: "https://a.storyblok.com/f/target/image.jpg",
                action: "match",
            },
        ]);
        expect(report.graph.assetFolders).toMatchObject([
            {
                sourceId: 20,
                action: "match",
            },
            {
                sourceId: 30,
                action: "match",
            },
        ]);
        expect(report.graph.assetReferences).toMatchObject([
            {
                assetId: 300,
                status: "mapped",
            },
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("summarizes duplicate unresolved foreign asset references by unique asset", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");
        const foreignAssetUrl =
            "https://a.storyblok.com/f/282295/8000x5000/dff09292b3/ashridge.jpg";

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "blog") {
                return Promise.resolve({
                    story: {
                        id: 1,
                        name: "Blog",
                        slug: "blog",
                        full_slug: "blog",
                        is_folder: true,
                        parent_id: 0,
                        uuid: "source-blog-uuid",
                        content: {
                            component: "page",
                            image: {
                                filename: foreignAssetUrl,
                            },
                            gallery: [
                                {
                                    filename: foreignAssetUrl,
                                },
                            ],
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.getAllStories.mockResolvedValue([]);
        mocks.createTree.mockImplementation((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [],
            },
        ]);
        mocks.getAllComponents.mockResolvedValue([
            {
                name: "page",
                schema: {
                    image: {
                        type: "asset",
                    },
                    gallery: {
                        type: "multiasset",
                    },
                },
            },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                withAssets: true,
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary).toMatchObject({
            assetReferences: 2,
            assetReferencesMapped: 0,
            assetReferencesPlanned: 0,
            assetReferencesUnresolved: 2,
            assets: 0,
        });
        expect(report.assetReferenceSummary).toMatchObject({
            unresolved: {
                occurrences: 2,
                uniqueAssets: 1,
            },
            foreignAssetSpaces: [
                {
                    spaceId: "282295",
                    occurrences: 2,
                    uniqueAssets: 1,
                },
            ],
        });
        expect(report.graph.assetReferences).toHaveLength(2);
        expect(report.graph.assetReferences).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    filename: foreignAssetUrl,
                    status: "unresolved",
                }),
            ]),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    describe("plan gate", () => {
        const stdin = process.stdin as any;
        const originalIsTTY = stdin.isTTY;
        const originalExitCode = process.exitCode;

        afterEach(() => {
            stdin.isTTY = originalIsTTY;
            process.exitCode = originalExitCode;
        });

        it("refuses to write without --yes when no terminal can answer", async () => {
            stdin.isTTY = false;

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                },
            } as any);

            expect(mocks.askYesNo).not.toHaveBeenCalled();
            expect(mocks.createStory).not.toHaveBeenCalled();
            expect(mocks.updateStory).not.toHaveBeenCalled();
            expect(process.exitCode).toBe(1);
        });

        it("asks Continue? on a terminal and stops on anything but yes", async () => {
            stdin.isTTY = true;
            mocks.askYesNo.mockResolvedValue(false);

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                },
            } as any);

            expect(mocks.askYesNo).toHaveBeenCalledWith("Continue? [y/N]");
            expect(mocks.createStory).not.toHaveBeenCalled();
            expect(process.exitCode).toBe(originalExitCode);
        });

        it("writes after an explicit yes on a terminal", async () => {
            stdin.isTTY = true;
            mocks.askYesNo.mockResolvedValue(true);
            const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                },
            } as any);

            expect(mocks.askYesNo).toHaveBeenCalledTimes(1);
            expect(mocks.createStory).toHaveBeenCalledTimes(2);

            await rm(tempDir, { recursive: true, force: true });
        });

        it("scans references and checks target paths before the gate in apply mode", async () => {
            stdin.isTTY = false;

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                },
            } as any);

            // Scanner ran (component schemas fetched) and every planned
            // target path was checked for adoption, all before any write.
            expect(mocks.getAllComponents).toHaveBeenCalledWith(
                expect.objectContaining({ spaceId: "source-space" }),
            );
            expect(mocks.getStoryBySlug).toHaveBeenCalledWith(
                "imported/blog/post-1",
                expect.objectContaining({ spaceId: "target-space" }),
            );
            expect(mocks.createStory).not.toHaveBeenCalled();
        });

        it("moves the existing ledger aside with --fresh and starts empty", async () => {
            const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
            const manifestRoot = path.join(tempDir, ".sb-mig");
            const manifestDirectory = path.join(
                manifestRoot,
                "copy",
                "source-space",
                "target-space",
            );
            const staleEntry = {
                type: "story",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 2,
                target_id: 5555,
                source_uuid: "source-post-uuid",
                target_uuid: "stale-target-post-uuid",
                source_full_slug: "blog/post-1",
                target_full_slug: "imported/blog/post-1",
                action: "created",
                created_at: "2026-06-23T10:00:00.000Z",
            };

            await mkdir(manifestDirectory, { recursive: true });
            await writeFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                JSON.stringify(staleEntry) + "\n",
                "utf8",
            );
            await writeFile(
                path.join(manifestDirectory, "stories.manifest.jsonl"),
                JSON.stringify(staleEntry) + "\n",
                "utf8",
            );

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot,
                    fresh: true,
                    yes: true,
                },
            } as any);

            // The stale mapping was not reused: both shells were created anew.
            expect(mocks.createStory).toHaveBeenCalledTimes(2);
            expect(mocks.getStoryById).not.toHaveBeenCalledWith(
                "5555",
                expect.anything(),
            );

            const { readdir } = await import("fs/promises");
            const files = (await readdir(manifestDirectory)).sort();

            expect(
                files.filter((file) => /^manifest\.jsonl\..+\.bak$/.test(file)),
            ).toHaveLength(1);
            expect(
                files.filter((file) =>
                    /^stories\.manifest\.jsonl\..+\.bak$/.test(file),
                ),
            ).toHaveLength(1);

            const combined = (
                await readFile(
                    path.join(manifestDirectory, "manifest.jsonl"),
                    "utf8",
                )
            )
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line));

            expect(combined.every((entry) => entry.target_id !== 5555)).toBe(
                true,
            );
            expect(combined.map((entry) => entry.source_id)).toEqual([1, 2]);

            await rm(tempDir, { recursive: true, force: true });
        });

        const writeStaleLedger = async (manifestRoot: string) => {
            const manifestDirectory = path.join(
                manifestRoot,
                "copy",
                "source-space",
                "target-space",
            );

            await mkdir(manifestDirectory, { recursive: true });
            await writeFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                JSON.stringify({
                    type: "story",
                    source_space_id: "source-space",
                    target_space_id: "target-space",
                    source_id: 2,
                    target_id: 5555,
                    source_uuid: "source-post-uuid",
                    target_uuid: "stale-target-post-uuid",
                    source_full_slug: "blog/post-1",
                    target_full_slug: "imported/blog/post-1",
                    action: "created",
                    created_at: "2026-06-23T10:00:00.000Z",
                }) + "\n",
                "utf8",
            );
        };

        it("plans a create, not a resume, when the mapped target story is gone", async () => {
            const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
            const manifestRoot = path.join(tempDir, ".sb-mig");

            await writeStaleLedger(manifestRoot);

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot,
                    yes: true,
                },
            } as any);

            const lines = planGateLines();

            expect(lines).toContain(
                "  2 items (1 folder) -> space target-space (2 create, 0 adopt existing, 0 resume from ledger)",
            );
            expect(lines).toContain(
                "    1 ledger mapping no longer resolves in space target-space and will be discarded.",
            );
            // And the plan told the truth: both shells really were created.
            expect(mocks.createStory).toHaveBeenCalledTimes(2);

            await rm(tempDir, { recursive: true, force: true });
        });

        it("plans an adoption when another story now holds the mapped target path", async () => {
            stdin.isTTY = true;
            mocks.askYesNo.mockResolvedValue(false);

            const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
            const manifestRoot = path.join(tempDir, ".sb-mig");
            const getStoryBySlug = mocks.getStoryBySlug.getMockImplementation();

            await writeStaleLedger(manifestRoot);

            mocks.getStoryBySlug.mockImplementation(
                (slug: string, options: any) => {
                    if (slug === "imported/blog/post-1") {
                        return Promise.resolve({
                            story: {
                                id: 7777,
                                slug: "post-1",
                                full_slug: "imported/blog/post-1",
                                uuid: "other-target-post-uuid",
                            },
                        });
                    }

                    return getStoryBySlug!(slug, options);
                },
            );

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot,
                },
            } as any);

            const lines = planGateLines();

            expect(lines).toContain(
                "  2 items (1 folder) -> space target-space (1 create, 1 adopt existing, 0 resume from ledger)",
            );
            expect(lines).toContain(
                "    1 ledger mapping no longer resolves in space target-space and will be discarded.",
            );
            expect(mocks.createStory).not.toHaveBeenCalled();

            await rm(tempDir, { recursive: true, force: true });
        });

        it("names the stories and field paths that will break before asking", async () => {
            stdin.isTTY = true;
            mocks.askYesNo.mockResolvedValue(false);
            mocks.getAllStories.mockResolvedValue([
                {
                    story: {
                        id: 2,
                        name: "Post 1",
                        slug: "post-1",
                        full_slug: "blog/post-1",
                        is_folder: false,
                        parent_id: 1,
                        uuid: "source-post-uuid",
                        content: {
                            component: "page",
                            cta: {
                                linktype: "story",
                                id: 999,
                            },
                        },
                    },
                },
            ]);

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                },
            } as any);

            const lines = planGateLines();
            const listingIndex = lines.indexOf("    WILL BREAK, by story:");

            expect(listingIndex).toBeGreaterThan(-1);
            expect(lines[listingIndex - 1]).toContain(
                "1 leave your selection and WILL BREAK",
            );
            expect(lines[listingIndex + 1]).toBe("      blog/post-1");
            expect(lines[listingIndex + 2]).toContain("-> #999");
            expect(lines[listingIndex + 2].trim()).toMatch(/^content\.cta/);

            // The detail is on screen before the operator is asked anything.
            const listingOrder = (
                Logger.log as unknown as ReturnType<typeof vi.fn>
            ).mock.invocationCallOrder[listingIndex];

            expect(mocks.askYesNo).toHaveBeenCalledTimes(1);
            expect(listingOrder).toBeLessThan(
                mocks.askYesNo.mock.invocationCallOrder[0],
            );
            expect(mocks.createStory).not.toHaveBeenCalled();
        });
    });

    it("copies selected stories and writes story manifests", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestDirectory, { recursive: true });
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            JSON.stringify({
                type: "asset",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 300,
                target_id: 900,
                source_filename:
                    "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                target_filename: "https://a.storyblok.com/f/target/image.jpg",
                action: "created",
                created_at: "2026-06-23T10:00:00.000Z",
            }) + "\n",
            "utf8",
        );

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.createStory).toHaveBeenCalledTimes(2);
        expect(mocks.createStory).toHaveBeenNthCalledWith(
            1,
            {
                content: {
                    _uid: "",
                    component: "page",
                },
                is_folder: true,
                name: "Blog",
                slug: "blog",
                parent_id: 900,
            },
            expect.objectContaining({ spaceId: "target-space" }),
            { publish: false },
        );
        expect(mocks.createStory).toHaveBeenNthCalledWith(
            2,
            {
                content: {
                    _uid: "",
                    component: "page",
                },
                is_folder: false,
                name: "Post 1",
                slug: "post-1",
                parent_id: 1001,
            },
            expect.objectContaining({ spaceId: "target-space" }),
            { publish: false },
        );

        const storyManifest = (
            await readFile(
                path.join(manifestDirectory, "stories.manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        const combinedManifest = (
            await readFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(storyManifest).toMatchObject([
            {
                type: "story",
                source_id: 1,
                target_id: 1001,
                source_uuid: "source-blog-uuid",
                target_uuid: "target-blog-uuid",
                source_full_slug: "blog",
                target_full_slug: "imported/blog",
                action: "created",
            },
            {
                type: "story",
                source_id: 2,
                target_id: 1002,
                source_uuid: "source-post-uuid",
                target_uuid: "target-post-uuid",
                source_full_slug: "blog/post-1",
                target_full_slug: "imported/blog/post-1",
                action: "created",
            },
        ]);
        expect(combinedManifest).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "asset",
                    source_id: 300,
                    target_id: 900,
                }),
                ...storyManifest.map((entry) => expect.objectContaining(entry)),
            ]),
        );
        expect(mocks.updateStory).toHaveBeenCalledTimes(2);
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    component: "page",
                    image: {
                        id: 900,
                        filename: "https://a.storyblok.com/f/target/image.jpg",
                    },
                    cta: {
                        linktype: "story",
                        id: 1002,
                    },
                },
                is_folder: true,
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            "1001",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    component: "page",
                    body: {
                        type: "doc",
                        content: [
                            {
                                type: "link",
                                attrs: {
                                    linktype: "story",
                                    uuid: "target-blog-uuid",
                                },
                            },
                        ],
                    },
                },
                is_folder: false,
                name: "Post 1",
                parent_id: 1001,
                slug: "post-1",
            }),
            "1002",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    /** A source story that carries a translated slug, the EF-shaped case. */
    const withTranslatedSlugs = (translated_slugs: unknown[]) => {
        mocks.getAllStories.mockResolvedValue([
            {
                story: {
                    id: 2,
                    name: "Post 1",
                    slug: "post-1",
                    full_slug: "blog/post-1",
                    is_folder: false,
                    parent_id: 1,
                    uuid: "source-post-uuid",
                    content: { component: "page" },
                    translated_slugs,
                },
            },
        ]);
    };

    it("carries translated slugs into the target in the shape the API writes", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));

        withTranslatedSlugs([
            {
                id: 555,
                story_id: 2,
                lang: "de",
                slug: "seite-eins",
                name: "Seite Eins",
            },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            },
        } as any);

        const postPayload = mocks.updateStory.mock.calls
            .map((call) => call[0])
            .find((payload: any) => payload?.slug === "post-1");

        expect(postPayload.translated_slugs_attributes).toEqual([
            { lang: "de", slug: "seite-eins", name: "Seite Eins" },
        ]);
        // The read shape is what the API accepts and ignores, which is how
        // these were lost without a word.
        expect(postPayload.translated_slugs).toBeUndefined();
        expect(planGateLines()).toContain(
            "  translated slugs: 1 carried across 1 story",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("leaves behind a translated slug the target space has no language for", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));

        withTranslatedSlugs([
            { lang: "de", slug: "seite-eins" },
            { lang: "fr", slug: "page-une" },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            },
        } as any);

        const postPayload = mocks.updateStory.mock.calls
            .map((call) => call[0])
            .find((payload: any) => payload?.slug === "post-1");

        // Warned, not failed: the rest of the copy is worth more than the
        // slug that cannot land.
        expect(postPayload.translated_slugs_attributes).toEqual([
            { lang: "de", slug: "seite-eins", name: null },
        ]);
        expect(
            (Logger.warning as unknown as ReturnType<typeof vi.fn>).mock.calls
                .map((call) => String(call[0]))
                .some((line) =>
                    line.includes(
                        "1 translated slug(s) will be left behind: space 'target-space' has no language(s) fr",
                    ),
                ),
        ).toBe(true);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("never asks the target space for languages when nothing is translated", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            },
        } as any);

        expect(mocks.getSpace).not.toHaveBeenCalled();
        expect(
            planGateLines().some((line) => line.includes("translated slug")),
        ).toBe(false);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("hands copy manifests a ledger it can read back cleanly", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const outputPath = path.join(tempDir, "reports", "ledger.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot,
                yes: true,
            },
        } as any);

        await copyCommand({
            input: ["copy", "manifests"],
            flags: {
                from: "source-space",
                to: "target-space",
                manifestRoot,
                outputPath,
            },
        } as any);

        const inspection = JSON.parse(await readFile(outputPath, "utf8"));

        // The inspector is only worth anything if it understands the ledger the
        // copier actually writes, not a fixture shaped like one.
        expect(inspection.summary).toMatchObject({
            stories: 2,
            conflicts: 0,
            errors: 0,
            storiesWithoutTargetPath: 0,
        });
        expect(inspection.findings).toEqual([]);
        expect(
            inspection.files.every(
                (file: any) => file.kind === "combined" || !file.error,
            ),
        ).toBe(true);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("writes the translated-slug account into the dry-run artifact", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        withTranslatedSlugs([
            { lang: "de", slug: "seite-eins", name: "Seite Eins" },
            { lang: "fr", slug: "page-une" },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        // A plan read back from its file has to say what the console said;
        // console-only accounting is invisible to whoever reviews the artifact.
        expect(report.translatedSlugs).toEqual({
            stories: 1,
            carried: 1,
            unsupported: 1,
            unsupportedLangs: ["fr"],
        });
        expect(report.warnings).toContainEqual({
            code: "translated_slugs_unsupported_language",
            message:
                "1 translated slug(s) will be left behind: space 'target-space' has no language(s) fr. Add them to the target space and copy again to carry them.",
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("writes the translated-slug account into the apply artifact", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "reports", "copy-report.json");

        withTranslatedSlugs([
            { lang: "de", slug: "seite-eins", name: "Seite Eins" },
            { lang: "fr", slug: "page-une" },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.dryRun).toBe(false);
        expect(report.translatedSlugs).toEqual({
            stories: 1,
            carried: 1,
            unsupported: 1,
            unsupportedLangs: ["fr"],
        });
        expect(report.warnings).toContainEqual({
            code: "translated_slugs_unsupported_language",
            message:
                "1 translated slug(s) will be left behind: space 'target-space' has no language(s) fr. Add them to the target space and copy again to carry them.",
        });
        // The count has to move with the warning, or the summary understates
        // the run it belongs to.
        expect(report.summary.warnings).toBe(1);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("fills copied story shells even when no references changed", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "plain") {
                return Promise.resolve({
                    story: {
                        id: 3,
                        name: "Plain Story",
                        slug: "plain",
                        full_slug: "plain",
                        is_folder: false,
                        parent_id: 0,
                        uuid: "source-plain-uuid",
                        content: {
                            component: "page",
                            headline: "No references here",
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.createTree.mockImplementationOnce((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [],
            },
        ]);
        mocks.createStory.mockResolvedValueOnce({
            story: {
                id: 1003,
                uuid: "target-plain-uuid",
                full_slug: "imported/plain",
            },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "plain",
                destination: "imported",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.createStory).toHaveBeenCalledWith(
            {
                content: {
                    _uid: "",
                    component: "page",
                },
                is_folder: false,
                name: "Plain Story",
                slug: "plain",
                parent_id: 900,
            },
            expect.objectContaining({ spaceId: "target-space" }),
            { publish: false },
        );
        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    component: "page",
                    headline: "No references here",
                },
                name: "Plain Story",
                parent_id: 900,
                slug: "plain",
            }),
            "1003",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("publishes clean published copied stories by default", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "published") {
                return Promise.resolve({
                    story: {
                        id: 4,
                        name: "Published Story",
                        slug: "published",
                        full_slug: "published",
                        is_folder: false,
                        parent_id: 0,
                        uuid: "source-published-uuid",
                        published: true,
                        unpublished_changes: false,
                        content: {
                            component: "page",
                            headline: "Published content",
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.createTree.mockImplementationOnce((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [],
            },
        ]);
        mocks.createStory.mockResolvedValueOnce({
            story: {
                id: 1004,
                uuid: "target-published-uuid",
                full_slug: "imported/published",
            },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "published",
                destination: "imported",
                publicationLanguages: "default",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    component: "page",
                    headline: "Published content",
                },
                name: "Published Story",
                parent_id: 900,
                slug: "published",
            }),
            "1004",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.publishStoryLanguages).toHaveBeenCalledWith(
            {
                storyId: 1004,
                story: expect.objectContaining({
                    name: "Published Story",
                    slug: "published",
                }),
                languages: ["[default]"],
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("keeps published copied stories as drafts in save-only publication mode", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "published") {
                return Promise.resolve({
                    story: {
                        id: 4,
                        name: "Published Story",
                        slug: "published",
                        full_slug: "published",
                        is_folder: false,
                        parent_id: 0,
                        uuid: "source-published-uuid",
                        published: true,
                        unpublished_changes: false,
                        content: {
                            component: "page",
                            headline: "Published content",
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.createTree.mockImplementationOnce((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [],
            },
        ]);
        mocks.createStory.mockResolvedValueOnce({
            story: {
                id: 1004,
                uuid: "target-published-uuid",
                full_slug: "published",
            },
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "published",
                destination: "imported",
                publicationMode: "save-only",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Published Story",
                slug: "published",
            }),
            "1004",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.publishStoryLanguages).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    it("preserves dirty published story layers by publishing the source published layer then restoring draft", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        name: "Imported",
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "dirty") {
                return Promise.resolve({
                    story: {
                        id: 5,
                        name: "Dirty Published Story",
                        slug: "dirty",
                        full_slug: "dirty",
                        is_folder: false,
                        parent_id: 0,
                        uuid: "source-dirty-uuid",
                        published: true,
                        unpublished_changes: true,
                        content: {
                            component: "page",
                            headline: "Draft content",
                        },
                    },
                });
            }

            return Promise.resolve(undefined);
        });
        mocks.createTree.mockImplementationOnce((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: [],
            },
        ]);
        mocks.createStory.mockResolvedValueOnce({
            story: {
                id: 1005,
                uuid: "target-dirty-uuid",
                full_slug: "dirty",
            },
        });
        mocks.getStoryVersions.mockResolvedValueOnce({
            story_versions: [
                {
                    id: 77,
                    status: "published",
                    created_at: "2026-06-20T10:00:00.000Z",
                    content: {
                        component: "page",
                        headline: "Published content",
                    },
                },
            ],
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "dirty",
                destination: "imported",
                publicationLanguages: "default",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.updateStory).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                content: {
                    component: "page",
                    headline: "Published content",
                },
                name: "Dirty Published Story",
                slug: "dirty",
            }),
            "1005",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.publishStoryLanguages).toHaveBeenCalledWith(
            {
                storyId: 1005,
                story: expect.objectContaining({
                    content: {
                        component: "page",
                        headline: "Published content",
                    },
                }),
                languages: ["[default]"],
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.updateStory).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                content: {
                    component: "page",
                    headline: "Draft content",
                },
                name: "Dirty Published Story",
                slug: "dirty",
            }),
            "1005",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("does not report success when copied story shell updates still fail after stale mapping recovery", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.updateStory
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                response: "This record could not be found",
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                response: "This record could not be found",
            });

        await expect(
            copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot,
                    yes: true,
                },
            } as any),
        ).rejects.toThrow(
            "Failed to update copied story 'blog' in target space 'target-space'",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("keeps updating the remaining stories when one story update fails, then reports the failure", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        // First update (the 'blog' folder shell) is rejected by the target
        // space schema; the rest of the tree must still be updated.
        mocks.updateStory
            .mockResolvedValueOnce({
                ok: false,
                status: 422,
                response:
                    ": The component(s) sb-content-group are not allowed in the field content",
            })
            .mockResolvedValue({ ok: true });

        await expect(
            copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                    manifestRoot,
                    yes: true,
                },
            } as any),
        ).rejects.toThrow(
            "Copy finished but 1 story/story shell update(s) failed",
        );

        // Both stories were attempted even though the first one failed.
        expect(mocks.updateStory).toHaveBeenCalledTimes(2);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("recovers when a mapped story reads successfully but cannot be updated", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestDirectory, { recursive: true });
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            JSON.stringify({
                type: "story",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 1,
                target_id: 9999,
                source_uuid: "source-blog-uuid",
                target_uuid: "stale-target-blog-uuid",
                source_full_slug: "blog",
                target_full_slug: "imported/blog",
                action: "created",
                created_at: "2026-06-23T10:00:00.000Z",
            }) + "\n",
            "utf8",
        );

        mocks.getStoryById.mockResolvedValueOnce({
            story: {
                id: 9999,
                uuid: "stale-target-blog-uuid",
                full_slug: "imported/blog",
            },
        });
        const getStoryBySlug = mocks.getStoryBySlug.getMockImplementation();
        mocks.getStoryBySlug.mockImplementation(
            (slug: string, options: any) => {
                if (slug === "imported/blog") {
                    return Promise.resolve({
                        story: {
                            id: 9999,
                            uuid: "stale-target-blog-uuid",
                            full_slug: "imported/blog",
                        },
                    });
                }

                return getStoryBySlug?.(slug, options);
            },
        );
        mocks.updateStory
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                response: "This record could not be found",
            })
            .mockResolvedValue({ ok: true });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.createStory).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            expect.objectContaining({ spaceId: "target-space" }),
            { publish: false },
        );
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            "1001",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Post 1",
                parent_id: 1001,
                slug: "post-1",
            }),
            "1002",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        const combinedManifest = (
            await readFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(combinedManifest).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "story",
                    source_id: 1,
                    target_id: 1001,
                    action: "created",
                }),
            ]),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("repairs stale story manifest mappings before filling shells", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );

        await mkdir(manifestDirectory, { recursive: true });
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            JSON.stringify({
                type: "story",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 1,
                target_id: 9999,
                source_uuid: "source-blog-uuid",
                target_uuid: "stale-target-blog-uuid",
                source_full_slug: "blog",
                target_full_slug: "imported/blog",
                action: "created",
                created_at: "2026-06-23T10:00:00.000Z",
            }) + "\n",
            "utf8",
        );

        mocks.getStoryById.mockResolvedValueOnce(undefined);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot,
                yes: true,
            },
        } as any);

        expect(mocks.getStoryById).toHaveBeenCalledWith(
            "9999",
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.createStory).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            expect.objectContaining({ spaceId: "target-space" }),
            { publish: false },
        );
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            "1001",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        const combinedManifest = (
            await readFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(combinedManifest).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "story",
                    source_id: 1,
                    target_id: 1001,
                    action: "created",
                }),
            ]),
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("copies referenced assets before stories when withAssets is passed", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );
        const outputPath = path.join(tempDir, "reports", "with-assets.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                withAssets: true,
                manifestRoot,
                outputPath,
                yes: true,
            },
        } as any);

        expect(mocks.createAssetFolder).toHaveBeenCalledTimes(2);
        expect(mocks.createAssetAndFinalize).toHaveBeenCalledWith(
            {
                spaceId: "target-space",
                pathToFile: "/tmp/source-image.jpg",
                payload: {
                    filename:
                        "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                    asset_folder_id: 130,
                },
            },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(
            mocks.createAssetAndFinalize.mock.invocationCallOrder[0],
        ).toBeLessThan(mocks.createStory.mock.invocationCallOrder[0]);

        const assetManifest = (
            await readFile(
                path.join(manifestDirectory, "assets.manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        const storyManifest = (
            await readFile(
                path.join(manifestDirectory, "stories.manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(assetManifest).toMatchObject([
            {
                type: "asset",
                source_id: 300,
                target_id: 900,
                source_filename:
                    "https://a.storyblok.com/f/source-space/1200x800/sourcehash/image.jpg",
                target_filename: "https://a.storyblok.com/f/target/image.jpg",
                action: "created",
            },
        ]);
        expect(storyManifest).toHaveLength(2);
        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            command: "copy stories",
            dryRun: false,
            normalized: {
                sourceSpaceId: "source-space",
                targetSpaceId: "target-space",
                source: "blog",
                destination: "imported",
                withAssets: true,
            },
            summary: {
                storyFoldersPlanned: 1,
                storiesPlanned: 1,
                storiesCreated: 2,
                assetsCreated: 1,
                assetFoldersCreated: 2,
            },
            assetCopy: {
                command: "copy assets",
                dryRun: false,
                summary: {
                    assetsCreated: 1,
                    assetFoldersCreated: 2,
                },
            },
        });
        expect(report.manifestPaths).toMatchObject({
            stories: path.join(manifestDirectory, "stories.manifest.jsonl"),
            assets: path.join(manifestDirectory, "assets.manifest.jsonl"),
            assetFolders: path.join(
                manifestDirectory,
                "asset-folders.manifest.jsonl",
            ),
            combined: path.join(manifestDirectory, "manifest.jsonl"),
        });
        expect(mocks.updateStory).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    image: {
                        id: 900,
                        filename: "https://a.storyblok.com/f/target/image.jpg",
                    },
                }),
                is_folder: true,
                name: "Blog",
                parent_id: 900,
                slug: "blog",
            }),
            "1001",
            { force_update: true, publish: false },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });
});
