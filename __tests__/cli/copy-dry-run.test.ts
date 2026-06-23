import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getAllComponents: vi.fn(),
    createTree: vi.fn(),
    traverseAndCreate: vi.fn(),
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
            createStory: mocks.createStory,
            updateStory: mocks.updateStory,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
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

describe("copy stories dry-run", () => {
    beforeEach(() => {
        vi.clearAllMocks();

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
                                    "https://a.storyblok.com/f/source/image.jpg",
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
                schema: {},
            },
        ]);
        mocks.updateStory.mockResolvedValue({ ok: true });
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
                "assets_not_copied",
                "asset_fields_not_rewritten",
                "story_references_not_rewritten",
                "create_only",
            ],
        });
        expect(report.commands.apply).toBe(
            "sb-mig copy stories --from source-space --to target-space --source blog --mode subtree --destination imported",
        );

        await rm(tempDir, { recursive: true, force: true });
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
                source_filename: "https://a.storyblok.com/f/source/image.jpg",
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
            },
        } as any);

        expect(mocks.createStory).toHaveBeenCalledTimes(2);
        expect(mocks.createStory).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                slug: "blog",
                parent_id: 900,
            }),
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.createStory).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                slug: "post-1",
                parent_id: 1001,
            }),
            expect.objectContaining({ spaceId: "target-space" }),
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
            {
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
            },
            "1001",
            { force_update: true },
            expect.objectContaining({ spaceId: "target-space" }),
        );
        expect(mocks.updateStory).toHaveBeenCalledWith(
            {
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
            },
            "1002",
            { force_update: true },
            expect.objectContaining({ spaceId: "target-space" }),
        );

        await rm(tempDir, { recursive: true, force: true });
    });
});
