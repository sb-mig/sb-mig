import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: { spaceId: "test", sbApi: {} },
    sbApi: {},
}));

const createStory = vi.fn();
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            createStory: (...args: any[]) => createStory(...args),
        },
    },
}));

const { createStoriesAndWriteManifests } = await import(
    "../../src/cli/commands/copy.js"
);
const { loadManifest, getDefaultCopyManifestPaths } = await import(
    "../../src/api/copy/index.js"
);

const story = (id: number, slug: string, isFolder = false) => ({
    id,
    uuid: `uuid-${id}`,
    full_slug: slug,
    slug: slug.split("/").at(-1),
    name: slug,
    is_folder: isFolder,
    content: { component: "page" },
});

const treeNode = (s: any, children: any[] = []) => ({
    id: s.id,
    story: s,
    children,
});

describe("createStoriesAndWriteManifests (parallel shell phase)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-shell-"));
        createStory.mockReset();
        let nextId = 1000;
        createStory.mockImplementation((payload: any) =>
            Promise.resolve({
                story: {
                    id: ++nextId,
                    uuid: `t-uuid-${nextId}`,
                    full_slug: payload.slug,
                    parent_id: payload.parent_id ?? null,
                },
            }),
        );
    });

    it("creates parents before children and writes manifest entries", async () => {
        const folder = story(1, "src", true);
        const child = story(2, "src/page");
        const summary = await createStoriesAndWriteManifests({
            tree: [treeNode(folder, [treeNode(child)])],
            realParentId: null,
            sourceStoryById: new Map([
                [1, folder],
                [2, child],
            ]),
            targetSlugBySourceSlug: new Map([
                ["src", "src"],
                ["src/page", "src/page"],
            ]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map(),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(summary.storiesCreated + summary.storyFoldersPlanned).toBeGreaterThan(0);
        // child call happened after parent call and carries the parent target id
        const childCall = createStory.mock.calls.find(
            (call) => call[0].slug === "page",
        );
        expect(childCall?.[0].parent_id).toBeGreaterThan(1000);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        expect(await loadManifest(paths.stories)).toHaveLength(2);
    });

    it("matches against the prefetch map without any api call", async () => {
        const src = story(1, "src");
        await createStoriesAndWriteManifests({
            tree: [treeNode(src)],
            realParentId: null,
            sourceStoryById: new Map([[1, src]]),
            targetSlugBySourceSlug: new Map([["src", "src"]]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map([
                ["src", { id: 77, uuid: "t-77", full_slug: "src" }],
            ]),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(createStory).not.toHaveBeenCalled();
    });

    it("trusts a verified mapping matching the prefetch map without creating a new story", async () => {
        const src = story(1, "src");
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        await fs.mkdir(path.dirname(paths.combined), { recursive: true });
        await fs.writeFile(
            paths.combined,
            JSON.stringify({
                type: "story",
                source_space_id: "1",
                target_space_id: "2",
                source_id: 1,
                target_id: 77,
                source_uuid: "uuid-1",
                target_uuid: "t-77",
                source_full_slug: "src",
                target_full_slug: "src",
                action: "created",
                created_at: new Date().toISOString(),
            }) + "\n",
            "utf8",
        );

        const summary = await createStoriesAndWriteManifests({
            tree: [treeNode(src)],
            realParentId: null,
            sourceStoryById: new Map([[1, src]]),
            targetSlugBySourceSlug: new Map([["src", "src"]]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map([
                ["src", { id: 77, uuid: "t-77", full_slug: "src" }],
            ]),
            verify: true,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });

        expect(createStory).not.toHaveBeenCalled();
        expect(summary.storiesMatched).toBe(1);
        expect(summary.failures).toHaveLength(0);
    });

    it("a failed parent skips its branch but the run continues", async () => {
        createStory.mockRejectedValueOnce(new Error("boom"));
        const badParent = story(1, "bad", true);
        const orphan = story(2, "bad/child");
        const sibling = story(3, "ok");
        const result = await createStoriesAndWriteManifests({
            tree: [
                treeNode(badParent, [treeNode(orphan)]),
                treeNode(sibling),
            ],
            realParentId: null,
            sourceStoryById: new Map([
                [1, badParent],
                [2, orphan],
                [3, sibling],
            ]),
            targetSlugBySourceSlug: new Map([
                ["bad", "bad"],
                ["bad/child", "bad/child"],
                ["ok", "ok"],
            ]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map(),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].fullSlug).toBe("bad");
        // sibling still created, orphan not attempted
        const slugs = createStory.mock.calls.map((call) => call[0].slug);
        expect(slugs).toContain("ok");
        expect(slugs).not.toContain("child");
    });
});
