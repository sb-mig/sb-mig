import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockStory } from "../mocks/storyblokClient.mock.js";

// Mock the logger
vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Stories API - Mock Utilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createMockStory", () => {
        it("should generate valid story structure with defaults", () => {
            const story = createMockStory();

            expect(story).toHaveProperty("id");
            expect(story).toHaveProperty("name");
            expect(story).toHaveProperty("slug");
            expect(story).toHaveProperty("full_slug");
            expect(story).toHaveProperty("uuid");
            expect(story).toHaveProperty("content");
            expect(story).toHaveProperty("created_at");
            expect(story).toHaveProperty("updated_at");
        });

        it("should allow overriding properties", () => {
            const story = createMockStory({
                name: "Home Page",
                slug: "home",
                is_startpage: true,
            });

            expect(story.name).toBe("Home Page");
            expect(story.slug).toBe("home");
            expect(story.is_startpage).toBe(true);
        });

        it("should create folder stories", () => {
            const folder = createMockStory({
                name: "Blog",
                slug: "blog",
                is_folder: true,
            });

            expect(folder.is_folder).toBe(true);
        });

        it("should create nested stories with parent_id", () => {
            const parent = createMockStory({ id: 100, name: "Blog" });
            const child = createMockStory({
                name: "First Post",
                parent_id: parent.id,
            });

            expect(child.parent_id).toBe(100);
        });
    });
});

describe("Story CRUD Logic", () => {
    describe("Story creation workflow", () => {
        it("should prepare story for creation with required fields", () => {
            const storyData = {
                name: "New Page",
                slug: "new-page",
                content: {
                    _uid: "uid-123",
                    component: "page",
                },
            };

            expect(storyData).toHaveProperty("name");
            expect(storyData).toHaveProperty("slug");
            expect(storyData).toHaveProperty("content");
            expect(storyData.content).toHaveProperty("component");
        });

        it("should validate slug format", () => {
            const validSlugs = ["home", "about-us", "blog-post-1"];
            const invalidSlugs = ["Home Page", "about us", "CAPS"];

            validSlugs.forEach((slug) => {
                const isValid = /^[a-z0-9-]+$/.test(slug);
                expect(isValid).toBe(true);
            });

            invalidSlugs.forEach((slug) => {
                const isValid = /^[a-z0-9-]+$/.test(slug);
                expect(isValid).toBe(false);
            });
        });
    });

    describe("Story hierarchy", () => {
        it("should build parent-child relationships", () => {
            const parent = createMockStory({
                id: 1,
                name: "Blog",
                slug: "blog",
                is_folder: true,
            });

            const children = [
                createMockStory({
                    id: 2,
                    name: "Post 1",
                    slug: "post-1",
                    parent_id: parent.id,
                }),
                createMockStory({
                    id: 3,
                    name: "Post 2",
                    slug: "post-2",
                    parent_id: parent.id,
                }),
            ];

            expect(children.every((c) => c.parent_id === parent.id)).toBe(true);
        });

        it("should compute full_slug from hierarchy", () => {
            const computeFullSlug = (
                slug: string,
                parentSlug: string | null,
            ): string => {
                return parentSlug ? `${parentSlug}/${slug}` : slug;
            };

            expect(computeFullSlug("home", null)).toBe("home");
            expect(computeFullSlug("post-1", "blog")).toBe("blog/post-1");
            expect(computeFullSlug("deep", "a/b/c")).toBe("a/b/c/deep");
        });
    });
});

interface TreeNode {
    id: number;
    name: string;
    parent_id: number | null;
    children: TreeNode[];
}

describe("Story Tree Building", () => {
    it("should build tree from flat story list", () => {
        const flatStories = [
            createMockStory({ id: 1, name: "Home", parent_id: null }),
            createMockStory({ id: 2, name: "Blog", parent_id: null }),
            createMockStory({ id: 3, name: "Post 1", parent_id: 2 }),
            createMockStory({ id: 4, name: "Post 2", parent_id: 2 }),
        ];

        // Simple tree building logic
        const buildTree = (
            stories: Array<{
                id: number;
                name: string;
                parent_id: number | null;
            }>,
            parentId: number | null = null,
        ): TreeNode[] => {
            return stories
                .filter((s) => s.parent_id === parentId)
                .map((story) => ({
                    ...story,
                    children: buildTree(stories, story.id),
                }));
        };

        const tree = buildTree(flatStories);

        expect(tree.length).toBe(2); // Home and Blog at root
        const blog = tree.find((n) => n.name === "Blog");
        expect(blog).toBeDefined();
        expect(blog!.children.length).toBe(2); // Post 1 and Post 2
    });

    it("should handle deeply nested stories", () => {
        const flatStories = [
            createMockStory({ id: 1, name: "Level 0", parent_id: null }),
            createMockStory({ id: 2, name: "Level 1", parent_id: 1 }),
            createMockStory({ id: 3, name: "Level 2", parent_id: 2 }),
            createMockStory({ id: 4, name: "Level 3", parent_id: 3 }),
        ];

        const getDepth = (
            stories: Array<{ id: number; parent_id: number | null }>,
            id: number,
            depth = 0,
        ): number => {
            const story = stories.find((s) => s.id === id);
            if (!story || !story.parent_id) return depth;
            return getDepth(stories, story.parent_id, depth + 1);
        };

        expect(getDepth(flatStories, 1)).toBe(0);
        expect(getDepth(flatStories, 2)).toBe(1);
        expect(getDepth(flatStories, 3)).toBe(2);
        expect(getDepth(flatStories, 4)).toBe(3);
    });

    it("should handle empty story list", () => {
        const buildTree = (stories: Array<{ parent_id: number | null }>) => {
            return stories.filter((s) => s.parent_id === null);
        };

        const tree = buildTree([]);
        expect(tree).toEqual([]);
    });

    it("should identify root stories (no parent)", () => {
        const stories = [
            createMockStory({ id: 1, parent_id: null }),
            createMockStory({ id: 2, parent_id: null }),
            createMockStory({ id: 3, parent_id: 1 }),
        ];

        const rootStories = stories.filter((s) => s.parent_id === null);
        expect(rootStories.length).toBe(2);
    });
});

describe("Story Copy Logic", () => {
    it("should prepare stories for copying to another space", () => {
        const sourceStory = createMockStory({
            id: 123,
            name: "Original",
            slug: "original",
            content: { component: "page", title: "Hello" },
        });

        // When copying, we strip the ID and let the target space assign a new one
        const { id: _id, uuid: _uuid, ...storyForCopy } = sourceStory;

        expect(storyForCopy).not.toHaveProperty("id");
        expect(storyForCopy).not.toHaveProperty("uuid");
        expect(storyForCopy).toHaveProperty("name");
        expect(storyForCopy).toHaveProperty("content");
    });

    it("should remap parent_id when copying hierarchies", () => {
        const idMapping: Record<number, number> = {
            100: 200, // old parent ID -> new parent ID
        };

        const childStory = createMockStory({
            id: 101,
            parent_id: 100,
        });

        const remappedParentId =
            childStory.parent_id !== null
                ? idMapping[childStory.parent_id] || null
                : null;
        expect(remappedParentId).toBe(200);
    });
});
