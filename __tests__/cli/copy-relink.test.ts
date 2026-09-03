import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
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

/** Writes a ledger the run will read back, the way an earlier copy left it. */
const writeLedger = async (manifestRoot: string, entries: unknown[]) => {
    const dir = path.join(manifestRoot, "copy", "source-space", "target-space");

    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "manifest.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
        "utf8",
    );
};

const storyLedgerEntry = (entry: Record<string, unknown>) => ({
    type: "story",
    source_space_id: "source-space",
    target_space_id: "target-space",
    action: "created",
    created_at: "2026-09-03T00:00:00.000Z",
    ...entry,
});

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

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

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

        await copyCommand(relinkFlags({ manifestRoot, dryRun: true }) as any);

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

    /**
     * The state a half-finished copy really leaves behind: the ledger still
     * maps a story whose target has since been deleted, and a story that IS in
     * the target still references it.
     */
    const setUpStaleLedgerMapping = async (manifestRoot: string) => {
        const sourceReferencingPost = {
            ...sourcePost,
            content: {
                component: "page",
                cta: { linktype: "story", id: 3, uuid: "source-post-3-uuid" },
            },
        };
        const sourceDeletedPost = {
            id: 3,
            name: "Post 3",
            slug: "post-3",
            full_slug: "blog/post-3",
            is_folder: false,
            parent_id: 1,
            uuid: "source-post-3-uuid",
            content: { component: "page" },
        };

        targetPost.content = {
            component: "page",
            cta: { linktype: "story", id: 3, uuid: "source-post-3-uuid" },
        };

        await writeLedger(manifestRoot, [
            storyLedgerEntry({
                source_id: 3,
                target_id: 3003,
                source_uuid: "source-post-3-uuid",
                target_uuid: "deleted-target-uuid",
                source_full_slug: "blog/post-3",
                target_full_slug: "imported/blog/post-3",
            }),
        ]);

        mocks.getAllStories.mockResolvedValue([
            { story: sourceReferencingPost },
            { story: sourceDeletedPost },
        ]);
        mocks.createTree.mockImplementation((stories: any[]) => [
            {
                id: stories[0].id,
                story: stories[0],
                children: stories.slice(1).map((story: any) => ({
                    id: story.id,
                    story,
                    children: [],
                })),
            },
        ]);
        // The mapped target story was deleted, and no story lives at its path.
        mocks.getStoryById.mockResolvedValue(undefined);
    };

    it("never rewrites a reference through a ledger mapping whose target is gone", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await setUpStaleLedgerMapping(manifestRoot);

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        // Leaving the broken reference alone is the correct outcome: pointing
        // it at the deleted story would be worse than the break.
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.updateStory.mock.calls)).not.toContain(
            "deleted-target-uuid",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("classifies references into a story missing from the target as breaks", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await setUpStaleLedgerMapping(manifestRoot);

        await copyCommand(relinkFlags({ manifestRoot, dryRun: true }) as any);

        const lines = planLines();

        expect(lines).toContain(
            "    1 planned story is not in the target and cannot be relinked; copy it first.",
        );
        expect(lines).toContain(
            "  source references: 2 will relink, 1 leave your selection and WILL BREAK",
        );
        expect(lines).toContain(
            "    References into the story missing from the target cannot be repaired here; copy it first, then relink again.",
        );
        // The shared ledger line must not offer a flag this command lacks.
        expect(
            lines.some((line) => line.includes("use --fresh to ignore")),
        ).toBe(false);

        await rm(tempDir, { recursive: true, force: true });
    });

    it("repairs references into stories outside the selection when the mapping still resolves", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        targetPost.content = {
            component: "page",
            cta: { linktype: "story", id: 5, uuid: "shared-header-uuid" },
        };

        await writeLedger(manifestRoot, [
            storyLedgerEntry({
                source_id: 5,
                target_id: 5005,
                source_uuid: "shared-header-uuid",
                target_uuid: "target-header-uuid",
                source_full_slug: "shared/header",
                target_full_slug: "imported/shared/header",
            }),
        ]);
        mocks.getStoryById.mockImplementation((storyId: string) =>
            Promise.resolve(
                storyId === "5005"
                    ? { story: { id: 5005, uuid: "target-header-uuid" } }
                    : undefined,
            ),
        );

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(mocks.updateStory.mock.calls[0][0]).toMatchObject({
            content: {
                cta: { id: 5005, uuid: "target-header-uuid" },
            },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("does not call a reference broken when the ledger already covers it", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        // The source story links to a story outside this selection; the target
        // copy of it already points at the right story. Nothing to repair, and
        // nothing to shout about: the ledger covers the reference.
        mocks.getAllStories.mockResolvedValue([
            {
                story: {
                    ...sourcePost,
                    content: {
                        component: "page",
                        cta: {
                            linktype: "story",
                            id: 5,
                            uuid: "shared-header-uuid",
                        },
                    },
                },
            },
        ]);
        targetPost.content = {
            component: "page",
            cta: {
                linktype: "story",
                id: 5005,
                uuid: "target-header-uuid",
            },
        };

        await writeLedger(manifestRoot, [
            storyLedgerEntry({
                source_id: 5,
                target_id: 5005,
                source_uuid: "shared-header-uuid",
                target_uuid: "target-header-uuid",
                source_full_slug: "shared/header",
                target_full_slug: "imported/shared/header",
            }),
        ]);

        await copyCommand(relinkFlags({ manifestRoot, dryRun: true }) as any);

        const lines = planLines();

        expect(lines).toContain(
            "  source references: 2 will relink, 0 will break",
        );
        expect(lines.some((line) => line.includes("WILL BREAK"))).toBe(false);
        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    it("drops an out-of-selection ledger mapping whose target story is gone", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        targetPost.content = {
            component: "page",
            cta: { linktype: "story", id: 5, uuid: "shared-header-uuid" },
        };

        await writeLedger(manifestRoot, [
            storyLedgerEntry({
                source_id: 5,
                target_id: 5005,
                source_uuid: "shared-header-uuid",
                target_uuid: "target-header-uuid",
                source_full_slug: "shared/header",
                target_full_slug: "imported/shared/header",
            }),
        ]);
        // The mapped story is no longer in the target space.
        mocks.getStoryById.mockResolvedValue(undefined);

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).not.toHaveBeenCalled();

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
