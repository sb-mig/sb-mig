import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Integration-level tests for Task 10's resume fast path, wired all the way
// through copyCommand: a checkpointed story whose source content hasn't
// changed and has zero unresolved references must skip both the content
// fetch (getStoryById) and the content write (updateStory) entirely.

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStoriesWithoutContent: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getAllComponents: vi.fn(),
    sbApiGet: vi.fn(),
    logSuccess: vi.fn(),
    logError: vi.fn(),
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
            getAllStoriesWithoutContent: mocks.getAllStoriesWithoutContent,
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
        success: mocks.logSuccess,
        warning: vi.fn(),
        error: mocks.logError,
    },
}));

import { copyCommand } from "../../src/cli/commands/copy.js";

const UPDATED_AT = "2026-08-17T00:00:00.000Z";

describe("copy stories resume fast path (Task 10)", () => {
    let tempDir: string;
    let manifestRoot: string;
    let manifestDirectory: string;

    beforeEach(async () => {
        vi.clearAllMocks();

        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-resume-"));
        manifestRoot = path.join(tempDir, ".sb-mig");
        manifestDirectory = path.join(
            manifestRoot,
            "copy",
            "source-space",
            "target-space",
        );
        await mkdir(manifestDirectory, { recursive: true });

        // Root "blog" (id 1) and child "a" (id 2) already have shell
        // mappings from a prior run; child "b" (id 3) is brand new. Child
        // "a" additionally has a content checkpoint that matches its
        // (unchanged) updated_at and has zero unresolved references, so it
        // is eligible for the resume fast path.
        const manifestLines = [
            {
                type: "story",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 1,
                target_id: 1001,
                source_uuid: "uuid-blog",
                target_uuid: "target-uuid-blog",
                source_full_slug: "blog",
                target_full_slug: "imported/blog",
                action: "created",
                created_at: "2026-08-16T00:00:00.000Z",
            },
            {
                type: "story",
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 2,
                target_id: 1002,
                source_uuid: "uuid-a",
                target_uuid: "target-uuid-a",
                source_full_slug: "blog/a",
                target_full_slug: "imported/blog/a",
                action: "created",
                created_at: "2026-08-16T00:00:00.000Z",
            },
            {
                type: "story_content",
                schema_version: 1,
                source_space_id: "source-space",
                target_space_id: "target-space",
                source_id: 2,
                target_id: 1002,
                source_updated_at: UPDATED_AT,
                content_hash: "sha256:does-not-matter-for-fast-path",
                unresolved_refs: 0,
                created_at: "2026-08-16T00:00:00.000Z",
                // Gate identity (Task 10 hardening): must match the
                // current run's publication mode/languages and this
                // story's planned target slug. copyCommand defaults to
                // "preserve-layers" mode with no explicit
                // --publicationLanguages, which resolves to ["[default]"]
                // given the mocked (empty) target-space language list.
                publication_mode: "preserve-layers",
                publish_languages: ["[default]"],
                target_full_slug: "imported/blog/a",
            },
        ];
        await writeFile(
            path.join(manifestDirectory, "manifest.jsonl"),
            manifestLines.map((line) => JSON.stringify(line)).join("\n") +
                "\n",
            "utf8",
        );

        mocks.getAllComponents.mockResolvedValue([]);
        mocks.createStory.mockResolvedValue({
            story: {
                id: 1003,
                uuid: "target-uuid-b",
                full_slug: "imported/blog/b",
            },
        });
        mocks.updateStory.mockResolvedValue({ ok: true });
        mocks.sbApiGet.mockImplementation((url: string) => {
            if (url === "spaces/target-space/stories/") {
                return Promise.resolve({ data: { stories: [] } });
            }

            return Promise.resolve({ data: { space: { languages: [] } } });
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
                        uuid: "uuid-blog",
                        published: false,
                        unpublished_changes: false,
                        content: { component: "page" },
                    },
                });
            }

            return Promise.resolve(undefined);
        });

        mocks.getAllStoriesWithoutContent.mockResolvedValue([
            {
                id: 2,
                uuid: "uuid-a",
                name: "A",
                slug: "a",
                full_slug: "blog/a",
                is_folder: false,
                parent_id: 1,
                published: false,
                unpublished_changes: false,
                updated_at: UPDATED_AT,
            },
            {
                id: 3,
                uuid: "uuid-b",
                name: "B",
                slug: "b",
                full_slug: "blog/b",
                is_folder: false,
                parent_id: 1,
                published: false,
                unpublished_changes: false,
                updated_at: UPDATED_AT,
            },
        ]);
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it("skips the content fetch and the content write for a checkpointed, unresolved-ref-free story", async () => {
        mocks.getStoryById.mockImplementation((id: any) => {
            if (String(id) === "2") {
                throw new Error(
                    "resume fast path must not fetch content for a checkpointed story",
                );
            }

            if (String(id) === "3") {
                return Promise.resolve({
                    story: {
                        id: 3,
                        uuid: "uuid-b",
                        name: "B",
                        slug: "b",
                        full_slug: "blog/b",
                        is_folder: false,
                        parent_id: 1,
                        published: false,
                        unpublished_changes: false,
                        content: { component: "page", title: "B content" },
                    },
                });
            }

            return Promise.resolve(undefined);
        });

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

        expect(mocks.getStoryById).not.toHaveBeenCalledWith(
            "2",
            expect.anything(),
        );
        expect(mocks.getStoryById).toHaveBeenCalledWith(
            "3",
            expect.anything(),
        );

        // Child "a" (target id 1002) never gets a content write; child "b"
        // (newly created target id 1003) does.
        const updatedTargetIds = mocks.updateStory.mock.calls.map(
            (call) => call[1],
        );
        expect(updatedTargetIds).not.toContain("1002");
        expect(updatedTargetIds).toContain("1003");

        // No shell is (re)created for the already-mapped stories.
        expect(mocks.createStory).toHaveBeenCalledTimes(1);
    });

    it("--verify disables the resume fast path", async () => {
        mocks.getStoryById.mockImplementation((id: any) => {
            if (String(id) === "2") {
                return Promise.resolve({
                    story: {
                        id: 2,
                        uuid: "uuid-a",
                        name: "A",
                        slug: "a",
                        full_slug: "blog/a",
                        is_folder: false,
                        parent_id: 1,
                        published: false,
                        unpublished_changes: false,
                        content: { component: "page", title: "A content" },
                    },
                });
            }

            if (String(id) === "3") {
                return Promise.resolve({
                    story: {
                        id: 3,
                        uuid: "uuid-b",
                        name: "B",
                        slug: "b",
                        full_slug: "blog/b",
                        is_folder: false,
                        parent_id: 1,
                        published: false,
                        unpublished_changes: false,
                        content: { component: "page", title: "B content" },
                    },
                });
            }

            return Promise.resolve(undefined);
        });

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                manifestRoot,
                verify: true,
            },
        } as any);

        // --verify forces every story into needsContentIds, including the
        // otherwise-checkpointed child "a".
        expect(mocks.getStoryById).toHaveBeenCalledWith(
            "2",
            expect.anything(),
        );
    });

    it("dry-run reports the resume fast path and does not fetch content for it (I6)", async () => {
        // Dry-run never resolves publish languages (to avoid an extra API
        // call while merely planning), so the gate can only match when
        // both sides have no languages at all -- i.e. save-only mode. The
        // shared checkpoint above is written for "preserve-layers", so it
        // is patched here to a save-only checkpoint instead.
        const manifestPath = path.join(manifestDirectory, "manifest.jsonl");
        const existingEntries = (await readFile(manifestPath, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        const patchedEntries = existingEntries.map((entry: any) =>
            entry.type === "story_content"
                ? {
                      ...entry,
                      publication_mode: "save-only",
                      publish_languages: undefined,
                  }
                : entry,
        );
        await writeFile(
            manifestPath,
            patchedEntries.map((entry: any) => JSON.stringify(entry)).join(
                "\n",
            ) + "\n",
            "utf8",
        );

        mocks.getStoryById.mockImplementation((id: any) => {
            if (String(id) === "2") {
                throw new Error(
                    "dry-run resume fast path must not fetch content for a checkpointed story",
                );
            }

            if (String(id) === "3") {
                return Promise.resolve({
                    story: {
                        id: 3,
                        uuid: "uuid-b",
                        name: "B",
                        slug: "b",
                        full_slug: "blog/b",
                        is_folder: false,
                        parent_id: 1,
                        published: false,
                        unpublished_changes: false,
                        content: { component: "page", title: "B content" },
                    },
                });
            }

            return Promise.resolve(undefined);
        });

        const outputPath = path.join(tempDir, "reports", "resume-dry-run.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                publicationMode: "save-only",
                manifestRoot,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.summary.storiesSkipped).toBeGreaterThan(0);
        expect(mocks.getStoryById).not.toHaveBeenCalledWith(
            "2",
            expect.anything(),
        );
        expect(mocks.logSuccess).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Resume: \d+ stories already up to date \(checkpointed\)\.$/,
            ),
        );
    });

    it("excludes a story from the tree entirely when its content fetch fails, instead of writing content: {} (C1)", async () => {
        mocks.getStoryById.mockImplementation((id: any) => {
            if (String(id) === "2") {
                throw new Error(
                    "resume fast path must not fetch content for a checkpointed story",
                );
            }

            // Story "b" (id 3) simulates a content-fetch failure:
            // getStoryById already logs and resolves undefined internally
            // on error (see stories.ts's own try/catch).
            return Promise.resolve(undefined);
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
                },
            } as any),
        ).rejects.toThrow(/story content fetch\(es\) failed/);

        // Story "b" is excluded entirely: no shell created for it, no
        // content write for it -- NOT a shell silently created with an
        // empty payload.
        expect(mocks.createStory).not.toHaveBeenCalled();
        const updatedTargetIds = mocks.updateStory.mock.calls.map(
            (call) => call[1],
        );
        expect(updatedTargetIds).not.toContain("1003");

        // The rest of the copy still completed: story "a"'s own fast path
        // is entirely unaffected by "b"'s failure.
        expect(mocks.getStoryById).not.toHaveBeenCalledWith(
            "2",
            expect.anything(),
        );

        // No manifest entry (shell mapping or checkpoint) was ever written
        // for the excluded story.
        const combinedManifest = (
            await readFile(
                path.join(manifestDirectory, "manifest.jsonl"),
                "utf8",
            )
        )
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(
            combinedManifest.some((entry: any) => entry.source_id === 3),
        ).toBe(false);
    });
});
