import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    createStory: vi.fn(),
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

        const manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
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
        expect(combinedManifest).toMatchObject(storyManifest);

        await rm(tempDir, { recursive: true, force: true });
    });
});
