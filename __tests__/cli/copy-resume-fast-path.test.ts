import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
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
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
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
});
