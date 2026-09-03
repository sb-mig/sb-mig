import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getAllComponents: vi.fn(),
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
            createStory: mocks.createStory,
            updateStory: mocks.updateStory,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        assets: {},
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

const planLines = () =>
    (Logger.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
    );

/** The reference the copy left behind: still the SOURCE folder's uuid and id. */
const brokenTargetContent = () => ({
    component: "page",
    cta: {
        linktype: "story",
        id: 1,
        uuid: "source-blog-uuid",
    },
});

/** The same field after a healthy copy: the target folder's uuid and id. */
const repairedTargetContent = () => ({
    component: "page",
    cta: {
        linktype: "story",
        id: 1001,
        uuid: "target-blog-uuid",
    },
});

const sourceFolder = {
    id: 1,
    name: "Blog",
    slug: "blog",
    full_slug: "blog",
    is_folder: true,
    parent_id: 0,
    uuid: "source-blog-uuid",
    content: { component: "page" },
};

const sourcePost = {
    id: 2,
    name: "Post 1",
    slug: "post-1",
    full_slug: "blog/post-1",
    is_folder: false,
    parent_id: 1,
    uuid: "source-post-uuid",
    content: brokenTargetContent(),
};

const targetFolder = {
    id: 1001,
    name: "Blog",
    slug: "blog",
    full_slug: "imported/blog",
    is_folder: true,
    uuid: "target-blog-uuid",
};

const relinkFlags = (extra: Record<string, unknown> = {}) => ({
    input: ["copy", "relink"],
    flags: {
        from: "source-space",
        to: "target-space",
        source: "blog",
        destination: "imported",
        ...extra,
    },
});

describe("copy relink", () => {
    const stdin = process.stdin as any;
    const originalIsTTY = stdin.isTTY;
    const originalExitCode = process.exitCode;
    let targetPost: any;

    afterEach(() => {
        stdin.isTTY = originalIsTTY;
        process.exitCode = originalExitCode;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        stdin.isTTY = false;

        targetPost = {
            id: 1002,
            name: "Post 1",
            slug: "post-1",
            full_slug: "imported/blog/post-1",
            is_folder: false,
            uuid: "target-post-uuid",
            published: false,
            content: brokenTargetContent(),
        };

        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            const stories: Record<string, any> = {
                blog: sourceFolder,
                imported: {
                    id: 900,
                    slug: "imported",
                    full_slug: "imported",
                    is_folder: true,
                    uuid: "target-imported-uuid",
                },
                "imported/blog": targetFolder,
                "imported/blog/post-1": targetPost,
            };

            return Promise.resolve(
                stories[slug] ? { story: stories[slug] } : undefined,
            );
        });
        mocks.getAllStories.mockResolvedValue([{ story: sourcePost }]);
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
        mocks.getAllComponents.mockResolvedValue([
            {
                name: "page",
                schema: {
                    cta: { type: "multilink" },
                },
            },
        ]);
        mocks.updateStory.mockResolvedValue({ ok: true });
    });

    it("rebuilds the mapping from the target space and repairs the reference", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await copyCommand(
            relinkFlags({ manifestRoot, yes: true }) as any,
        );

        // Nothing was created and nothing was copied from the source: one
        // story updated, carrying only the remapped reference.
        expect(mocks.createStory).not.toHaveBeenCalled();
        expect(mocks.updateStory).toHaveBeenCalledTimes(1);

        const [payload, storyId, options] = mocks.updateStory.mock.calls[0];

        expect(storyId).toBe("1002");
        expect(options).toMatchObject({ publish: false, force_update: true });
        expect(payload).toMatchObject({
            id: 1002,
            name: "Post 1",
            slug: "post-1",
            content: repairedTargetContent(),
        });

        // Both target stories were adopted into the ledger before the rewrite.
        const manifest = (
            await readFile(
                path.join(
                    manifestRoot,
                    "copy",
                    "source-space",
                    "target-space",
                    "manifest.jsonl",
                ),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(manifest).toMatchObject([
            {
                source_id: 1,
                target_id: 1001,
                source_uuid: "source-blog-uuid",
                target_uuid: "target-blog-uuid",
                action: "matched_by_target_key",
            },
            {
                source_id: 2,
                target_id: 1002,
                source_uuid: "source-post-uuid",
                target_uuid: "target-post-uuid",
                action: "matched_by_target_key",
            },
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("leaves a story whose references already resolve untouched", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        targetPost.content = repairedTargetContent();

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            }) as any,
        );

        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(planLines()).toContain(
            "  rewrite: 0 references in 0 stories; 1 already correct and left untouched",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("states the exact rewrite before asking, and refuses to write without an answer", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await copyCommand(relinkFlags({ manifestRoot }) as any);

        const lines = planLines();

        expect(lines).toContain(
            "  2 planned items (1 folder) in space target-space (0 mapped by ledger, 2 adopted by target path, 0 missing from target)",
        );
        expect(lines).toContain(
            "  rewrite: 2 references in 1 story; 0 already correct and left untouched",
        );
        expect(lines).toContain(
            "  content: only reference values change; nothing is copied from the source",
        );
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        // The gate refused before anything was recorded in the ledger.
        await expect(
            readFile(
                path.join(
                    manifestRoot,
                    "copy",
                    "source-space",
                    "target-space",
                    "manifest.jsonl",
                ),
                "utf8",
            ),
        ).rejects.toThrow();

        await rm(tempDir, { recursive: true, force: true });
    });

    it("previews without touching Storyblok or the ledger on --dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await copyCommand(
            relinkFlags({ manifestRoot, dryRun: true }) as any,
        );

        expect(planLines()).toContain(
            "  rewrite: 2 references in 1 story; 0 already correct and left untouched",
        );
        expect(mocks.askYesNo).not.toHaveBeenCalled();
        expect(mocks.updateStory).not.toHaveBeenCalled();
        await expect(
            readFile(
                path.join(
                    manifestRoot,
                    "copy",
                    "source-space",
                    "target-space",
                    "manifest.jsonl",
                ),
                "utf8",
            ),
        ).rejects.toThrow();

        await rm(tempDir, { recursive: true, force: true });
    });

    it("reports planned stories that are not in the target at all", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            const stories: Record<string, any> = {
                blog: sourceFolder,
                imported: { id: 900, slug: "imported", full_slug: "imported" },
                "imported/blog": targetFolder,
            };

            return Promise.resolve(
                stories[slug] ? { story: stories[slug] } : undefined,
            );
        });

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            }) as any,
        );

        expect(planLines()).toContain(
            "    1 planned story is not in the target and cannot be relinked; copy it first.",
        );
        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });
});
