import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

// End-to-end acceptance test for the copy resume feature (Task 13). Drives
// the real copyCommand against an in-memory fake source + target space, with
// only managementApi.stories/components, the api-config sbApi and the
// rate-limited StoryblokClient constructor mocked -- everything else (tree
// building, checkpoint hashing, manifest read/write) is the real
// implementation running against a temp manifestRoot.

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getAllStoriesWithoutContent: vi.fn(),
    getStoryById: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getAllComponents: vi.fn(),
    sbApiGet: vi.fn(),
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: { spaceId: "1", sbApi: { get: mocks.sbApiGet } },
    sbApi: { get: mocks.sbApiGet },
}));

// copyCommand constructs its own rate-limited StoryblokClient (Task 12 fix)
// instead of reusing apiConfig.sbApi directly, so this must be intercepted
// too -- see copy-resume-fast-path.test.ts for the same pattern.
vi.mock("storyblok-js-client", () => ({
    default: vi.fn().mockImplementation(() => ({ get: mocks.sbApiGet })),
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            getStoryBySlug: mocks.getStoryBySlug,
            getAllStoriesWithoutContent: mocks.getAllStoriesWithoutContent,
            getStoryById: mocks.getStoryById,
            createStory: mocks.createStory,
            updateStory: mocks.updateStory,
            publishStoryLanguages: vi.fn().mockResolvedValue({ ok: true }),
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        assets: {
            getAllAssets: vi.fn().mockResolvedValue({ assets: [] }),
            getAllAssetFolders: vi.fn().mockResolvedValue({ asset_folders: [] }),
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

import {
    getDefaultCopyManifestPaths,
    loadManifest,
} from "../../src/api/copy/index.js";
import { copyCommand } from "../../src/cli/commands/copy.js";
import Logger from "../../src/utils/logger.js";

const SOURCE_SPACE = "1";
const TARGET_SPACE = "2";

const makeStory = (
    id: number,
    fullSlug: string,
    {
        isFolder = false,
        parentId = 0,
        title,
    }: { isFolder?: boolean; parentId?: number; title?: string } = {},
) => ({
    id,
    uuid: `src-uuid-${id}`,
    name: fullSlug.split("/").at(-1),
    slug: fullSlug.split("/").at(-1),
    full_slug: fullSlug,
    is_folder: isFolder,
    parent_id: parentId,
    published: false,
    unpublished_changes: false,
    updated_at: "2026-08-01T00:00:00.000Z",
    content: { component: "page", title: title ?? fullSlug },
});

// Fake source space: two independent 6-node subtrees (2 folders + 4 stories
// each) -- "blog" is used by the standalone first-run scenario, "docs" by
// the crash/resume/edit lifecycle so the two scenarios never share state.
const BLOG_ROOT = 1;
const BLOG_A = 2;
const BLOG_SUB = 3;
const BLOG_B = 4;
const BLOG_C = 5;
const BLOG_D = 6;
const DOCS_ROOT = 11;
const DOCS_A = 12;
const DOCS_SUB = 13;
const DOCS_B = 14;
const DOCS_C = 15;
const DOCS_D = 16;

const sourceStoriesById = new Map<number, any>([
    [BLOG_ROOT, makeStory(BLOG_ROOT, "blog", { isFolder: true, parentId: 0 })],
    [BLOG_A, makeStory(BLOG_A, "blog/a", { parentId: BLOG_ROOT })],
    [
        BLOG_SUB,
        makeStory(BLOG_SUB, "blog/sub", {
            isFolder: true,
            parentId: BLOG_ROOT,
        }),
    ],
    [BLOG_B, makeStory(BLOG_B, "blog/sub/b", { parentId: BLOG_SUB })],
    [BLOG_C, makeStory(BLOG_C, "blog/sub/c", { parentId: BLOG_SUB })],
    [BLOG_D, makeStory(BLOG_D, "blog/d", { parentId: BLOG_ROOT })],
    [DOCS_ROOT, makeStory(DOCS_ROOT, "docs", { isFolder: true, parentId: 0 })],
    [DOCS_A, makeStory(DOCS_A, "docs/a", { parentId: DOCS_ROOT })],
    [
        DOCS_SUB,
        makeStory(DOCS_SUB, "docs/sub", {
            isFolder: true,
            parentId: DOCS_ROOT,
        }),
    ],
    [DOCS_B, makeStory(DOCS_B, "docs/sub/b", { parentId: DOCS_SUB })],
    [DOCS_C, makeStory(DOCS_C, "docs/sub/c", { parentId: DOCS_SUB })],
    [DOCS_D, makeStory(DOCS_D, "docs/d", { parentId: DOCS_ROOT })],
]);

// Two more independent subtrees for the multi-root scenario below. A real
// migration runs `copy stories` once per root folder, so these exercise
// several roots accumulating into ONE shared manifest.
const NEWS_ROOT = 21;
const NEWS_A = 22;
const NEWS_SUB = 23;
const NEWS_B = 24;
const NEWS_C = 25;
const NEWS_D = 26;
const HELP_ROOT = 31;
const HELP_A = 32;
const HELP_SUB = 33;
const HELP_B = 34;
const HELP_C = 35;
const HELP_D = 36;

for (const story of [
    makeStory(NEWS_ROOT, "news", { isFolder: true, parentId: 0 }),
    makeStory(NEWS_A, "news/a", { parentId: NEWS_ROOT }),
    makeStory(NEWS_SUB, "news/sub", { isFolder: true, parentId: NEWS_ROOT }),
    makeStory(NEWS_B, "news/sub/b", { parentId: NEWS_SUB }),
    makeStory(NEWS_C, "news/sub/c", { parentId: NEWS_SUB }),
    makeStory(NEWS_D, "news/d", { parentId: NEWS_ROOT }),
    makeStory(HELP_ROOT, "help", { isFolder: true, parentId: 0 }),
    makeStory(HELP_A, "help/a", { parentId: HELP_ROOT }),
    makeStory(HELP_SUB, "help/sub", { isFolder: true, parentId: HELP_ROOT }),
    makeStory(HELP_B, "help/sub/b", { parentId: HELP_SUB }),
    makeStory(HELP_C, "help/sub/c", { parentId: HELP_SUB }),
    makeStory(HELP_D, "help/d", { parentId: HELP_ROOT }),
]) {
    sourceStoriesById.set(story.id, story);
}

// Fake target space: created/matched purely in-memory, mutated only through
// managementApi.stories.createStory (never reset between tests, mirroring a
// real target space that accumulates state across resumed runs).
const targetStoriesById = new Map<number, any>();
const targetStoriesBySlug = new Map<string, any>();
let nextTargetId = 5000;

const readCombinedManifest = async (manifestRoot: string) => {
    const manifestPaths = getDefaultCopyManifestPaths({
        sourceSpaceId: SOURCE_SPACE,
        targetSpaceId: TARGET_SPACE,
        rootDir: manifestRoot,
    });
    return loadManifest(manifestPaths.combined);
};

const runCopy = (source: string, manifestRoot: string) =>
    copyCommand({
        input: ["copy", "stories"],
        flags: {
            from: SOURCE_SPACE,
            to: TARGET_SPACE,
            source,
            mode: "subtree",
            manifestRoot,
            publicationMode: "save-only",
        },
    } as any);

describe("copy stories: end-to-end resume scenarios", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.getStoryBySlug.mockImplementation((slug: string, config: any) => {
            if (config?.spaceId !== SOURCE_SPACE) {
                return Promise.resolve(undefined);
            }

            const match = [...sourceStoriesById.values()].find(
                (story) => story.full_slug === slug,
            );

            return Promise.resolve(match ? { story: match } : undefined);
        });

        mocks.getAllStoriesWithoutContent.mockImplementation(
            (params: any, config: any) => {
                if (config?.spaceId !== SOURCE_SPACE) {
                    return Promise.resolve([]);
                }

                const prefix = params?.options?.starts_with ?? "";
                const stubs = [...sourceStoriesById.values()]
                    .filter((story) => story.full_slug.startsWith(prefix))
                    .map(({ content: _content, ...stub }) => ({ ...stub }));

                return Promise.resolve(stubs);
            },
        );

        mocks.getStoryById.mockImplementation((id: any, config: any) => {
            if (config?.spaceId !== SOURCE_SPACE) {
                return Promise.resolve(undefined);
            }

            const match = sourceStoriesById.get(Number(id));

            return Promise.resolve(match ? { story: match } : undefined);
        });

        mocks.createStory.mockImplementation((payload: any) => {
            const id = ++nextTargetId;
            const parent = payload.parent_id
                ? targetStoriesById.get(Number(payload.parent_id))
                : undefined;
            const full_slug = parent
                ? `${parent.full_slug}/${payload.slug}`
                : payload.slug;
            const target = {
                id,
                uuid: `tgt-uuid-${id}`,
                full_slug,
                parent_id: payload.parent_id ?? null,
                is_folder: payload.is_folder === true,
            };
            targetStoriesById.set(id, target);
            targetStoriesBySlug.set(full_slug, target);

            return Promise.resolve({ story: target });
        });

        mocks.updateStory.mockImplementation(() =>
            Promise.resolve({ ok: true }),
        );

        mocks.getAllComponents.mockResolvedValue([]);

        mocks.sbApiGet.mockImplementation((url: string, params: any) => {
            if (url === `spaces/${TARGET_SPACE}/stories/`) {
                const startsWith = params?.starts_with;
                const stories = [...targetStoriesBySlug.values()].filter(
                    (story) =>
                        !startsWith || story.full_slug.startsWith(startsWith),
                );

                return Promise.resolve({
                    data: { stories },
                    total: stories.length,
                    perPage: params?.per_page ?? 100,
                });
            }

            return Promise.resolve({ data: {} });
        });
    });

    it("1. first run copies every story: 6 creates, 6 updates, manifest has 6 story entries + 6 checkpoints", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-e2e-first-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await runCopy("blog", manifestRoot);

        expect(mocks.createStory).toHaveBeenCalledTimes(6);
        expect(mocks.updateStory).toHaveBeenCalledTimes(6);

        const entries = await readCombinedManifest(manifestRoot);
        const storyEntries = entries.filter(
            (entry: any) => entry.type === "story",
        );
        const checkpointEntries = entries.filter(
            (entry: any) => entry.type === "story_content",
        );

        expect(storyEntries).toHaveLength(6);
        expect(checkpointEntries).toHaveLength(6);

        await rm(tempDir, { recursive: true, force: true });
    });

    describe("crash / resume / source-edit lifecycle (shared fake, shared manifest)", () => {
        let tempDir: string;
        let manifestRoot: string;

        beforeAll(async () => {
            tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-e2e-resume-"));
            manifestRoot = path.join(tempDir, ".sb-mig");
        });

        afterAll(async () => {
            await rm(tempDir, { recursive: true, force: true });
        });

        it("2. a crash mid-run leaves checkpoints only for the stories that finished", async () => {
            let callCount = 0;
            mocks.updateStory.mockImplementation(() => {
                callCount += 1;

                if (callCount <= 3) {
                    return Promise.resolve({ ok: true });
                }

                return Promise.reject(new Error("simulated crash"));
            });

            await expect(runCopy("docs", manifestRoot)).rejects.toThrow(
                /story\/story shell update\(s\) failed/,
            );

            // The shell phase is unaffected by the content-phase crash: every
            // shell was created before any content write was attempted.
            expect(mocks.createStory).toHaveBeenCalledTimes(6);
            // Every node was attempted (3 succeeded, 3 failed).
            expect(mocks.updateStory).toHaveBeenCalledTimes(6);

            const entries = await readCombinedManifest(manifestRoot);
            const storyEntries = entries.filter(
                (entry: any) => entry.type === "story",
            );
            const checkpointEntries = entries.filter(
                (entry: any) => entry.type === "story_content",
            );

            // Precondition for scenario 3's "all shells mapped, zero
            // creates" claim: the crashed run must have persisted all 6
            // shell mappings even though only 3 of the content writes
            // succeeded.
            expect(storyEntries).toHaveLength(6);
            expect(checkpointEntries).toHaveLength(3);
        });

        it("3. resume issues updateStory only for the unfinished stories and creates no new shells", async () => {
            await runCopy("docs", manifestRoot);

            // All 6 shells were already mapped by the crashed run's manifest.
            expect(mocks.createStory).not.toHaveBeenCalled();
            // Only the 3 stories left without a checkpoint get a content write.
            expect(mocks.updateStory).toHaveBeenCalledTimes(3);
            // Pins that the SKIP is actually caused by the resume fast path
            // (partitionStoriesForResume's fastPathSourceIds), not merely by
            // the rewrite phase's own content-hash compare: of the docs
            // tree's 5 children (a, sub, b, c, d -- the root is always
            // fetched separately via getStoryBySlug, never getStoryById),
            // "a" and "sub" already had a valid checkpoint from the crashed
            // run and must never reach getStoryById at all. If
            // partitionStoriesForResume regressed to always-empty, this
            // count would be 5 instead of 3 even though the hash-compare
            // skip below would still make updateStory's count look right.
            expect(mocks.getStoryById).toHaveBeenCalledTimes(3);

            const summaryCall = (Logger.log as any).mock.calls.find(
                (call: any[]) => String(call[0]).startsWith("Copy summary"),
            );
            expect(summaryCall?.[0]).toMatch(/skipped 3/);

            const entries = await readCombinedManifest(manifestRoot);
            const checkpointEntries = entries.filter(
                (entry: any) => entry.type === "story_content",
            );

            expect(checkpointEntries).toHaveLength(6);
        });

        it("4. a source edit between runs re-copies exactly the edited story", async () => {
            const edited = sourceStoriesById.get(DOCS_D);
            edited.updated_at = "2026-08-17T12:00:00.000Z";
            edited.content = { ...edited.content, title: "D updated" };

            await runCopy("docs", manifestRoot);

            expect(mocks.createStory).not.toHaveBeenCalled();
            expect(mocks.updateStory).toHaveBeenCalledTimes(1);
            expect(mocks.getStoryById).toHaveBeenCalledWith(
                String(DOCS_D),
                expect.anything(),
            );
            expect(mocks.getStoryById).not.toHaveBeenCalledWith(
                String(DOCS_A),
                expect.anything(),
            );
            expect(mocks.getStoryById).not.toHaveBeenCalledWith(
                String(DOCS_SUB),
                expect.anything(),
            );
        });
    });
    describe("multiple root folders copied one at a time (shared manifest)", () => {
        let tempDir: string;
        let manifestRoot: string;

        beforeAll(async () => {
            tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-e2e-roots-"));
            manifestRoot = path.join(tempDir, ".sb-mig");
        });

        afterAll(async () => {
            await rm(tempDir, { recursive: true, force: true });
        });

        it("5. a second root folder copies fully and keeps the first root's manifest entries", async () => {
            await runCopy("news", manifestRoot);

            expect(mocks.createStory).toHaveBeenCalledTimes(6);
            expect(mocks.updateStory).toHaveBeenCalledTimes(6);

            vi.clearAllMocks();

            await runCopy("help", manifestRoot);

            expect(mocks.createStory).toHaveBeenCalledTimes(6);
            expect(mocks.updateStory).toHaveBeenCalledTimes(6);

            const entries = await readCombinedManifest(manifestRoot);
            const storyEntries = entries.filter(
                (entry: any) => entry.type === "story",
            );
            const checkpointEntries = entries.filter(
                (entry: any) => entry.type === "story_content",
            );

            // The "help" run must not drop what the "news" run wrote: both
            // roots share one manifest keyed by source/target space pair.
            expect(storyEntries).toHaveLength(12);
            expect(checkpointEntries).toHaveLength(12);
        });

        it("6. re-running each root folder fast-paths everything, in any order", async () => {
            await runCopy("help", manifestRoot);

            expect(mocks.createStory).not.toHaveBeenCalled();
            expect(mocks.updateStory).not.toHaveBeenCalled();
            expect(mocks.getStoryById).not.toHaveBeenCalled();

            vi.clearAllMocks();

            await runCopy("news", manifestRoot);

            expect(mocks.createStory).not.toHaveBeenCalled();
            expect(mocks.updateStory).not.toHaveBeenCalled();
            expect(mocks.getStoryById).not.toHaveBeenCalled();

            const entries = await readCombinedManifest(manifestRoot);
            const checkpointEntries = entries.filter(
                (entry: any) => entry.type === "story_content",
            );

            expect(checkpointEntries).toHaveLength(12);
        });
    });
});
