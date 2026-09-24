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
    // MAR-3163: relink now reads version history for a dirty-published
    // story, publishes what was live, and asks the target for its languages.
    getStoryVersions: vi.fn(),
    publishStoryLanguages: vi.fn(),
    getSpace: vi.fn(),
    getAllComponents: vi.fn(),
    getAssetById: vi.fn(),
    // MAR-3404: relink checks its asset mappings against one listing.
    getAllAssets: vi.fn(),
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
            getStoryVersions: mocks.getStoryVersions,
            publishStoryLanguages: mocks.publishStoryLanguages,
        },
        spaces: {
            getSpace: mocks.getSpace,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        assets: {
            getAssetById: mocks.getAssetById,
            getAllAssets: mocks.getAllAssets,
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
import { getActiveProgress } from "../../src/utils/progress.js";

/** Reads what the run wrote to the terminal, as a pipe would see it. */
const withStdout = async (
    run: () => Promise<unknown>,
    { isTTY = false }: { isTTY?: boolean } = {},
) => {
    const chunks: string[] = [];
    const write = process.stdout.write;
    const wasTTY = process.stdout.isTTY;
    const ci = process.env["CI"];

    (process.stdout as any).isTTY = isTTY;
    delete process.env["CI"];
    (process.stdout as any).write = (chunk: any) => {
        chunks.push(String(chunk));
        return true;
    };

    try {
        await run();
    } finally {
        (process.stdout as any).write = write;
        (process.stdout as any).isTTY = wasTTY;

        if (ci !== undefined) {
            process.env["CI"] = ci;
        }
    }

    return chunks.join("");
};

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

const assetLedgerEntry = (entry: Record<string, unknown>) => ({
    type: "asset",
    source_space_id: "source-space",
    target_space_id: "target-space",
    source_id: 70,
    target_id: 7007,
    source_filename: "https://a.storyblok.com/f/111/logo.png",
    target_filename: "https://a.storyblok.com/f/222/logo.png",
    action: "created",
    created_at: "2026-09-03T00:00:00.000Z",
    ...entry,
});

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
        mocks.getAssetById.mockResolvedValue(undefined);
        mocks.getAllAssets.mockResolvedValue({ assets: [] });
        mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
        mocks.publishStoryLanguages.mockResolvedValue({
            ok: true,
            stage: "publish",
        });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
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

    /** Storyblok soft-deletes: a trashed story still answers a by-id read. */
    const TRASHED_AT = "2026-09-15T15:07:07.000Z";

    // MAR-3060 lap 2 F1 canary (relink, in the selection). Mutation that must
    // turn it red: ignore `deleted_at` in getValidMappedTargetStory.
    it("never rewrites a reference through a ledger mapping whose target is in the trash", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await setUpStaleLedgerMapping(manifestRoot);
        mocks.getStoryById.mockImplementation(async (id: string) =>
            String(id) === "3003"
                ? {
                      story: {
                          id: 3003,
                          uuid: "deleted-target-uuid",
                          full_slug: "imported/blog/post-3",
                          deleted_at: TRASHED_AT,
                      },
                  }
                : undefined,
        );

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(JSON.stringify(mocks.updateStory.mock.calls)).not.toContain(
            "deleted-target-uuid",
        );
        expect(
            (Logger.warning as unknown as ReturnType<typeof vi.fn>).mock.calls
                .map((call) => String(call[0]))
                .some(
                    (line) =>
                        line.includes("'blog/post-3'") &&
                        line.includes(
                            `points at a deleted story (trashed ${TRASHED_AT})`,
                        ),
                ),
        ).toBe(true);

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3405 R4 canary. Mutation that must turn it red: catch the
    // rejection in relink's ledger matching and answer "missing" again.
    it("stops on a target read that fails for good, and never calls the story missing", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const reportPath = path.join(tempDir, "relink.json");

        await setUpStaleLedgerMapping(manifestRoot);
        mocks.getStoryById.mockImplementation(async (id: string) => {
            if (String(id) === "3003") {
                throw new Error(
                    "Failed to fetch story '3003' with full content from space 'target-space' (fetch failed). Response: fetch failed (after 3 attempts)",
                );
            }

            return undefined;
        });

        await expect(
            copyCommand(
                relinkFlags({
                    manifestRoot,
                    dryRun: true,
                    outputPath: reportPath,
                }) as any,
            ),
        ).rejects.toThrow("Failed to fetch story '3003'");

        const printed = [
            ...planLines(),
            ...(
                Logger.warning as unknown as ReturnType<typeof vi.fn>
            ).mock.calls.map((call) => String(call[0])),
        ];

        expect(
            printed.some(
                (line) =>
                    line.includes("stale story manifest mapping") ||
                    line.includes("missing from target"),
            ),
        ).toBe(false);
        expect(printed.some((line) => line.trim().startsWith("rewrite:"))).toBe(
            false,
        );
        await expect(readFile(reportPath, "utf8")).rejects.toThrow();
        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3060 lap 2 F1 canary (relink, outside the selection). Mutation that
    // must turn it red: ignore `deleted_at` in validateRelinkLedgerMappings.
    it("drops an out-of-selection ledger mapping whose target story is in the trash", async () => {
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
        // The mapped story still answers by id, from the trash.
        mocks.getStoryById.mockImplementation(async (id: string) =>
            String(id) === "5005"
                ? {
                      story: {
                          id: 5005,
                          uuid: "target-header-uuid",
                          full_slug: "imported/shared/header",
                          deleted_at: TRASHED_AT,
                      },
                  }
                : undefined,
        );

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

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
        // The story the repaired reference points at is really there.
        mocks.getStoryById.mockImplementation((storyId: string) =>
            Promise.resolve(
                storyId === "5005"
                    ? {
                          story: {
                              id: 5005,
                              uuid: "target-header-uuid",
                              full_slug: "imported/shared/header",
                          },
                      }
                    : undefined,
            ),
        );

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

    it("repairs the stored path of a link an earlier run already relinked", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        // uuid already correct, path still the source's: the state every copy
        // made before paths were rewritten leaves behind.
        targetPost.content = {
            component: "page",
            cta: {
                linktype: "story",
                id: "target-header-uuid",
                cached_url: "shared/header",
            },
        };
        mocks.getStoryById.mockImplementation((storyId: string) =>
            Promise.resolve(
                storyId === "5005"
                    ? { story: { id: 5005, uuid: "target-header-uuid" } }
                    : undefined,
            ),
        );

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

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(mocks.updateStory.mock.calls[0][0]).toMatchObject({
            content: {
                cta: {
                    id: "target-header-uuid",
                    cached_url: "imported/shared/header",
                },
            },
        });

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

    /** A story whose only reference is an image the copy left pointing home. */
    const setUpStaleAssetLedger = async (manifestRoot: string) => {
        targetPost.content = {
            component: "page",
            image: {
                fieldtype: "asset",
                id: 70,
                filename: "https://a.storyblok.com/f/111/logo.png",
            },
        };

        await writeLedger(manifestRoot, [assetLedgerEntry({})]);
    };

    it("never rewrites an image through an asset mapping whose target file is gone", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await setUpStaleAssetLedger(manifestRoot);
        // The copied file was deleted in the target space since the copy:
        // the target library no longer lists it.
        mocks.getAllAssets.mockResolvedValue({ assets: [] });

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        // Pointing a live image at a deleted file is worse than the stale
        // filename it already has.
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.updateStory.mock.calls)).not.toContain(
            "https://a.storyblok.com/f/222/logo.png",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("repairs an image when the mapped target file is really there", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await setUpStaleAssetLedger(manifestRoot);
        mocks.getAllAssets.mockResolvedValue({
            assets: [
                {
                    id: 7007,
                    filename: "https://a.storyblok.com/f/222/logo.png",
                },
            ],
        });

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(mocks.updateStory.mock.calls[0][0]).toMatchObject({
            content: {
                image: {
                    id: 7007,
                    filename: "https://a.storyblok.com/f/222/logo.png",
                },
            },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    describe("asset mappings are checked against one listing (MAR-3404)", () => {
        const warnings = () =>
            (
                Logger.warning as unknown as ReturnType<typeof vi.fn>
            ).mock.calls.map((call) => String(call[0]));

        /** Three images copied as 7007, 7008, 7009; the target lists two. */
        const setUpThreeImages = async (manifestRoot: string) => {
            targetPost.content = {
                component: "page",
                hero: {
                    fieldtype: "asset",
                    id: 70,
                    filename: "https://a.storyblok.com/f/111/a.png",
                },
                logo: {
                    fieldtype: "asset",
                    id: 71,
                    filename: "https://a.storyblok.com/f/111/b.png",
                },
                icon: {
                    fieldtype: "asset",
                    id: 72,
                    filename: "https://a.storyblok.com/f/111/c.png",
                },
            };

            await writeLedger(manifestRoot, [
                assetLedgerEntry({
                    source_id: 70,
                    target_id: 7007,
                    source_filename: "https://a.storyblok.com/f/111/a.png",
                    target_filename: "https://a.storyblok.com/f/222/a.png",
                }),
                assetLedgerEntry({
                    source_id: 71,
                    target_id: 7008,
                    source_filename: "https://a.storyblok.com/f/111/b.png",
                    target_filename: "https://a.storyblok.com/f/222/b.png",
                }),
                assetLedgerEntry({
                    source_id: 72,
                    target_id: 7009,
                    source_filename: "https://a.storyblok.com/f/111/c.png",
                    target_filename: "https://a.storyblok.com/f/222/c.png",
                }),
            ]);
            mocks.getAllAssets.mockResolvedValue({
                assets: [
                    {
                        id: 7007,
                        filename: "https://a.storyblok.com/f/222/a.png",
                    },
                    {
                        id: 7008,
                        filename: "https://a.storyblok.com/f/222/b.png",
                    },
                ],
            });
        };

        // R1 canary. Mutation that must turn it red: go back to one
        // getAssetById per mapping.
        it("keeps the listed targets, marks only the unlisted one stale, and makes no per-asset GET", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );
            const manifestRoot = path.join(tempDir, ".sb-mig");
            const reportPath = path.join(tempDir, "relink.json");

            await setUpThreeImages(manifestRoot);

            await copyCommand(
                relinkFlags({
                    manifestRoot,
                    dryRun: true,
                    outputPath: reportPath,
                }) as any,
            );

            expect(mocks.getAssetById).toHaveBeenCalledTimes(0);
            expect(mocks.getAllAssets).toHaveBeenCalledTimes(1);
            expect(mocks.getAllAssets.mock.calls[0][0]).toEqual({
                spaceId: "target-space",
                quiet: true,
            });
            expect(planLines().join("\n")).toContain(
                // Two valid images, each rewritten in id and filename; the
                // stale third one is left as it is (all three would be 6).
                "rewrite: 4 references in 1 story;",
            );

            const report = JSON.parse(await readFile(reportPath, "utf8"));

            expect(
                report.staleAssetMappings.map(
                    (mapping: any) => mapping.targetId,
                ),
            ).toEqual([7009]);

            await rm(tempDir, { recursive: true, force: true });
        });

        // R4: without --verbose, one summary line and no per-asset lines.
        it("sums the stale mappings in one line without --verbose", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );
            const manifestRoot = path.join(tempDir, ".sb-mig");

            await setUpThreeImages(manifestRoot);

            await copyCommand(
                relinkFlags({ manifestRoot, dryRun: true }) as any,
            );

            const lines = [...planLines(), ...warnings()];

            expect(lines.some((line) => line.includes("Trying to get"))).toBe(
                false,
            );
            expect(
                lines.filter((line) =>
                    line.includes("Ignoring stale asset manifest mapping for"),
                ),
            ).toEqual([]);
            expect(
                lines.filter((line) =>
                    line.includes("stale asset manifest mapping(s)"),
                ),
            ).toEqual([
                "Ignoring 1 stale asset manifest mapping(s): their target assets are not in space 'target-space', so references to them are left as they are. The report lists them (staleAssetMappings).",
            ]);

            await rm(tempDir, { recursive: true, force: true });
        });

        it("names each stale mapping again with --verbose", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );
            const manifestRoot = path.join(tempDir, ".sb-mig");

            await setUpThreeImages(manifestRoot);

            await copyCommand(
                relinkFlags({
                    manifestRoot,
                    dryRun: true,
                    verbose: true,
                }) as any,
            );

            expect(
                warnings().filter((line) =>
                    line.includes("Ignoring stale asset manifest mapping for"),
                ),
            ).toHaveLength(1);

            await rm(tempDir, { recursive: true, force: true });
        });

        // R2 canary. Mutation that must turn it red: catch the listing error
        // and carry on with an empty library.
        it("stops on a listing that fails and marks nothing stale", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );
            const manifestRoot = path.join(tempDir, ".sb-mig");
            const reportPath = path.join(tempDir, "relink.json");

            await setUpThreeImages(manifestRoot);
            mocks.getAllAssets.mockRejectedValue(
                new Error("Listing assets failed on page 1 of ?: fetch failed"),
            );

            await expect(
                copyCommand(
                    relinkFlags({
                        manifestRoot,
                        dryRun: true,
                        outputPath: reportPath,
                    }) as any,
                ),
            ).rejects.toThrow(
                "Listing assets failed on page 1 of ?: fetch failed",
            );

            expect(
                warnings().some((line) =>
                    line.includes("stale asset manifest"),
                ),
            ).toBe(false);
            expect(
                planLines().some((line) => line.startsWith("rewrite:")),
            ).toBe(false);
            await expect(readFile(reportPath, "utf8")).rejects.toThrow();

            await rm(tempDir, { recursive: true, force: true });
        });
    });

    // MAR-3162 R6 canary. Mutation that must turn it red: select ledger asset
    // mappings by the source id and the verbatim source filename only, so a
    // story that mentions the file only as its own URL selects nothing.
    it("repairs an asset URL a story holds as a plain string", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const sourceUrl =
            "https://a.storyblok.com/f/111/1200x630/2b7c4d6e9a0b1c2d3e4f5a6b/flyer.pdf";
        const targetUrl =
            "https://a.storyblok.com/f/222/1200x630/2b7c4d6e9a0b1c2d3e4f5a6b/flyer.pdf";

        // The only mention of the file is a URL inside text, and the ledger
        // holds the library's own s3 host form of the same file.
        targetPost.content = {
            component: "page",
            html: `<a href="${sourceUrl}">flyer</a>`,
        };

        await writeLedger(manifestRoot, [
            assetLedgerEntry({
                source_id: 70,
                target_id: 7007,
                source_filename: `https://s3.amazonaws.com/a.storyblok.com${sourceUrl.slice("https://a.storyblok.com".length)}`,
                target_filename: targetUrl,
            }),
        ]);
        mocks.getAllAssets.mockResolvedValue({
            assets: [{ id: 7007, filename: targetUrl }],
        });

        await copyCommand(relinkFlags({ manifestRoot, dryRun: true }) as any);

        expect(planLines().join("\n")).toContain(
            "rewrite: 1 reference in 1 story; 0 already correct and left untouched",
        );

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(mocks.updateStory.mock.calls[0][0]).toMatchObject({
            content: { html: `<a href="${targetUrl}">flyer</a>` },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("rewrites the path of a story that moved after it was copied", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        // uuid already relinked, path still the source's — and the story has
        // been moved in the target since the ledger line was written.
        targetPost.content = {
            component: "page",
            cta: {
                linktype: "story",
                id: "target-header-uuid",
                cached_url: "shared/header",
            },
        };
        mocks.getStoryById.mockImplementation((storyId: string) =>
            Promise.resolve(
                storyId === "5005"
                    ? {
                          story: {
                              id: 5005,
                              uuid: "target-header-uuid",
                              full_slug: "moved/shared/header",
                          },
                      }
                    : undefined,
            ),
        );

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

        await copyCommand(relinkFlags({ manifestRoot, yes: true }) as any);

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        // The ledger records where the story was PUT; the space knows where it
        // is now, and the run has already read it.
        expect(mocks.updateStory.mock.calls[0][0]).toMatchObject({
            content: { cta: { cached_url: "moved/shared/header" } },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    it("leaves the target's translated slugs alone", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        targetPost.translated_slugs = [
            { id: 777, lang: "de", slug: "seite-eins", name: "Seite Eins" },
        ];

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            }) as any,
        );

        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        // Relink repairs reference values and nothing else: it never writes
        // the attributes form, so the target's own slugs cannot be rewritten.
        expect(
            mocks.updateStory.mock.calls[0][0].translated_slugs_attributes,
        ).toBeUndefined();
        expect(mocks.updateStory.mock.calls[0][0].translated_slugs).toEqual(
            targetPost.translated_slugs,
        );

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

    // MAR-3056 R1 canary for relink. Mutation that must turn it red: restore
    // the throw at the end of relinkTargetStories (no report is written).
    it("records a rejected update, writes the report, and exits 1 instead of throwing", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const outputPath = path.join(tempDir, "relink-report.json");

        process.exitCode = undefined;
        mocks.updateStory.mockResolvedValue({
            ok: false,
            status: 422,
            response:
                "The value of the field body must be a prosemirror document",
        });

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                outputPath,
                yes: true,
            }) as any,
        );

        expect(process.exitCode).toBe(1);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({ command: "copy relink", dryRun: false });
        expect(
            report.items.map((item: any) => [
                item.targetFullSlug,
                item.outcome,
            ]),
        ).toEqual([
            ["imported/blog", "matched"],
            ["imported/blog/post-1", "update_failed"],
        ]);
        expect(report.failures).toEqual([
            expect.objectContaining({
                resource: "story",
                path: "imported/blog/post-1",
                phase: "update",
                status: 422,
                targetId: 1002,
            }),
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 1 canary. Mutation that must turn it red:
    // count the ledger-adoption loop instead of the loop that saves stories.
    it("counts the stories it writes, not the ledger pass", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const written = await withStdout(() =>
            copyCommand(
                relinkFlags({
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                    yes: true,
                }) as any,
            ),
        );
        const rows = written
            .split("\n")
            .filter((line) => line.startsWith("relinking "));

        // One story is written; the folder carries no rewrite, and adopting
        // two ledger rows is not the work.
        expect(mocks.updateStory).toHaveBeenCalledTimes(1);
        expect(rows[0]).toContain("relinking 0/1 (0%)");
        expect(rows[rows.length - 1]).toContain("relinking 1/1 (100%)");
        expect(rows[rows.length - 1]).toContain("ok 1");
        expect(written).not.toContain("\r");

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 1 canary. Mutation that must turn it red: tick
    // a rejected update as `ok`, so the line disagrees with the report.
    it("counts a rejected update as a failure on the line", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        process.exitCode = undefined;
        mocks.updateStory.mockResolvedValue({ ok: false, status: 422 });

        const written = await withStdout(() =>
            copyCommand(
                relinkFlags({
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                    yes: true,
                }) as any,
            ),
        );
        const rows = written
            .split("\n")
            .filter((line) => line.startsWith("relinking "));

        expect(rows[rows.length - 1]).toContain("relinking 1/1 (100%)");
        expect(rows[rows.length - 1]).toContain("failed 1");

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 1 canary. Mutation that must turn it red:
    // print the per-story line whatever the caller asked for.
    it("keeps the per-story line for --verbose", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const rewritten = () =>
            (Logger.success as unknown as ReturnType<typeof vi.fn>).mock.calls
                .map((call) => String(call[0]))
                .filter((line) => line.includes("reference(s) rewritten."));

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
            }) as any,
        );

        expect(rewritten()).toEqual([]);

        vi.clearAllMocks();
        mocks.updateStory.mockResolvedValue({ ok: true });

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
                verbose: true,
            }) as any,
        );

        // The first run adopted the mapping, so the second rewrites both the
        // uuid and the id of the same reference.
        expect(rewritten()).toEqual([
            "  imported/blog/post-1: 2 reference(s) rewritten.",
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 1 canary. Mutation that must turn it red: drop
    // the `progress.finish()` at the end of the rewrite loop, so the finished
    // phase keeps the row and reappears under every later line.
    it("leaves no live line behind when the relink finishes", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const written = await withStdout(
            () =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        yes: true,
                        progress: "line",
                    }) as any,
                ),
            { isTTY: true },
        );

        expect(getActiveProgress()).toBeUndefined();
        // The live row was drawn, and it was ended.
        expect(written).toContain("\r");
        expect(written).toContain("relinking 1/1 (100%)");

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 3 canary. Mutation that must turn it red: drop
    // the `finally` that closes the live line, so every later message redraws
    // a dead progress line underneath itself.
    it("gives the terminal row back when a phase throws", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        mocks.updateStory.mockRejectedValue(new Error("network is down"));

        await withStdout(
            () =>
                expect(
                    copyCommand(
                        relinkFlags({
                            manifestRoot: path.join(tempDir, ".sb-mig"),
                            yes: true,
                            progress: "line",
                        }) as any,
                    ),
                ).rejects.toThrow("network is down"),
            { isTTY: true },
        );

        expect(getActiveProgress()).toBeUndefined();

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3356 lap 2 · finding 4 canary. Mutation that must turn it red:
    // accept any --progress value and fall back to auto.
    it("refuses a --progress value it does not know", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));

        await expect(
            copyCommand(
                relinkFlags({
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                    yes: true,
                    progress: "bogus",
                }) as any,
            ),
        ).rejects.toThrow("--progress must be one of: auto, line, plain, off.");

        // It stopped before reading anything, let alone writing.
        expect(mocks.getAllStories).not.toHaveBeenCalled();
        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    it("writes the relink plan with an empty failures array on --dry-run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const outputPath = path.join(tempDir, "relink-plan.json");

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                outputPath,
                dryRun: true,
            }) as any,
        );

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            command: "copy relink",
            dryRun: true,
            failures: [],
        });
        expect(mocks.updateStory).not.toHaveBeenCalled();

        await rm(tempDir, { recursive: true, force: true });
    });

    // MAR-3067 R8 (d) canary. Mutation that must turn it red: relink only the
    // first selection.
    it("relinks two selections in one run and states them in the PLAN", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-"));
        const sourceItem = {
            id: 3,
            name: "Item",
            slug: "item",
            full_slug: "news/item",
            is_folder: false,
            parent_id: 4,
            uuid: "source-item-uuid",
            content: brokenTargetContent(),
        };
        const targetItem = {
            id: 1003,
            name: "Item",
            slug: "item",
            full_slug: "imported/item",
            is_folder: false,
            uuid: "target-item-uuid",
            published: false,
            content: brokenTargetContent(),
        };
        const baseGetStoryBySlug = mocks.getStoryBySlug.getMockImplementation();

        mocks.getStoryBySlug.mockImplementation((slug: string, config: any) => {
            if (slug === "news/item") {
                return Promise.resolve({ story: sourceItem });
            }

            if (slug === "imported/item") {
                return Promise.resolve({ story: targetItem });
            }

            return baseGetStoryBySlug!(slug, config);
        });
        // A tree built by parent_id, the way createTree builds it.
        mocks.createTree.mockImplementation((stories: any[]) => {
            const build = (parentId: number | null): any[] =>
                stories
                    .filter((item) => (item.parent_id ?? null) === parentId)
                    .map((item) => ({
                        id: item.id,
                        parent_id: item.parent_id,
                        story: item,
                        children: build(item.id),
                    }));

            return build(null);
        });

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                yes: true,
                source: ["blog", "news/item"],
            }) as any,
        );

        expect(
            mocks.updateStory.mock.calls.map((call) => call[1]).sort(),
        ).toEqual(["1002", "1003"]);
        expect(planLines()).toContain(
            "  selections: 2 (2 stories, 1 folder after dedupe)",
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    describe("reading shows where it is (MAR-3363)", () => {
        /** The listing as the real one reports it: pages, then content. */
        const listingThatReports = ({ withTotal = true } = {}) =>
            mocks.getAllStories.mockImplementation(
                async ({ onProgress }: any) => {
                    if (withTotal) {
                        onProgress?.({
                            stage: "listing",
                            fetched: 1,
                            total: 1,
                        });
                    }

                    onProgress?.({ stage: "content", fetched: 1, total: 1 });

                    return [{ story: sourcePost }];
                },
            );
        const successLines = () =>
            (
                Logger.success as unknown as ReturnType<typeof vi.fn>
            ).mock.calls.map((call) => String(call[0]));

        // R2 canary. Mutation that must turn it red: leave `quiet` unset on
        // the listing, so its per-page and per-10 lines come back.
        it("lists, reads and matches on three phase lines, and says nothing per item", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );

            listingThatReports();

            const written = await withStdout(() =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        dryRun: true,
                        progress: "plain",
                    }) as any,
                ),
            );
            const at = (label: string) => written.indexOf(label);

            // In order, each with its own true total.
            expect(at("listing stories 0/1")).toBeGreaterThanOrEqual(0);
            expect(at("reading stories 0/1")).toBeGreaterThan(
                at("listing stories 0/1"),
            );
            expect(at("matching target 0/2")).toBeGreaterThan(
                at("reading stories 0/1"),
            );
            expect(written).toContain("listing stories 1/1 (100%)");
            expect(written).toContain("reading stories 1/1 (100%)");
            expect(written).toContain("matching target 2/2 (100%)");
            expect(written).not.toContain("\r");
            // The listing was asked to stay quiet, and the matching said
            // nothing per item.
            expect(mocks.getAllStories).toHaveBeenCalledWith(
                expect.objectContaining({ quiet: true }),
                expect.anything(),
            );
            expect(
                successLines().some((line) => line.startsWith("Matched ")),
            ).toBe(false);

            await rm(tempDir, { recursive: true, force: true });
        });

        it("gives the per-item lines back with --verbose", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );

            listingThatReports();

            await withStdout(() =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        dryRun: true,
                        verbose: true,
                    }) as any,
                ),
            );

            expect(mocks.getAllStories).toHaveBeenCalledWith(
                expect.objectContaining({ quiet: false }),
                expect.anything(),
            );
            expect(successLines()).toContain("Matched 2 of 2 planned item(s).");

            await rm(tempDir, { recursive: true, force: true });
        });

        // R3: a total is never made up. A listing without a `total` header
        // gives the listing phase nothing true to count against, so no
        // listing line is drawn; the read still shows its own true total.
        it("never draws a made-up listing total", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );

            listingThatReports({ withTotal: false });

            const written = await withStdout(() =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        dryRun: true,
                        progress: "plain",
                    }) as any,
                ),
            );

            expect(written).not.toContain("listing stories");
            expect(written).toContain("reading stories 1/1 (100%)");

            await rm(tempDir, { recursive: true, force: true });
        });

        // Fable's territory addition: a publishing relink says nothing per
        // published story unless asked.
        it("publishes without per-story lines, and with them under --verbose", async () => {
            const tempDir = await mkdtemp(
                path.join(tmpdir(), "sb-mig-relink-"),
            );

            targetPost = {
                ...targetPost,
                published: true,
                unpublished_changes: false,
                updated_at: "2026-09-23T08:00:00.000Z",
            };
            mocks.getStoryById.mockImplementation((id: string) =>
                Promise.resolve(
                    String(id) === "1002" ? { story: targetPost } : undefined,
                ),
            );
            listingThatReports();

            await withStdout(() =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        yes: true,
                    }) as any,
                ),
            );

            expect(mocks.publishStoryLanguages).toHaveBeenCalledWith(
                expect.objectContaining({ storyId: 1002, quiet: true }),
                expect.anything(),
            );

            vi.clearAllMocks();
            mocks.updateStory.mockResolvedValue({ ok: true });
            mocks.publishStoryLanguages.mockResolvedValue({
                ok: true,
                stage: "publish",
            });
            mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
            mocks.getStoryVersions.mockResolvedValue({ story_versions: [] });
            mocks.getAllComponents.mockResolvedValue([
                { name: "page", schema: { cta: { type: "multilink" } } },
            ]);
            mocks.getStoryById.mockImplementation((id: string) =>
                Promise.resolve(
                    String(id) === "1002" ? { story: targetPost } : undefined,
                ),
            );
            listingThatReports();
            await rm(tempDir, { recursive: true, force: true });

            await withStdout(() =>
                copyCommand(
                    relinkFlags({
                        manifestRoot: path.join(tempDir, ".sb-mig"),
                        yes: true,
                        verbose: true,
                    }) as any,
                ),
            );

            expect(mocks.publishStoryLanguages).toHaveBeenCalledWith(
                expect.objectContaining({ storyId: 1002, quiet: false }),
                expect.anything(),
            );

            await rm(tempDir, { recursive: true, force: true });
        });
    });
});
