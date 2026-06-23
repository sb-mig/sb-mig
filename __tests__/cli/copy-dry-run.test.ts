import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
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
                },
            },
        ]);

        mocks.createTree.mockImplementation((stories: any[]) => [
            {
                story: stories[0],
                children: [
                    {
                        story: stories[1],
                        children: [],
                    },
                ],
            },
        ]);
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
});
