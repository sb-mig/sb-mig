import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: { spaceId: "test", sbApi: {} },
    sbApi: {},
}));

const updateStory = vi.fn();
const getAllComponents = vi.fn().mockResolvedValue([]);
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            updateStory: (...args: any[]) => updateStory(...args),
        },
        components: {
            getAllComponents: (...args: any[]) => getAllComponents(...args),
        },
    },
}));

const { rewriteCopiedStoryContents } =
    await import("../../src/cli/commands/copy.js");
const { appendManifestEntry, getDefaultCopyManifestPaths, loadManifest } =
    await import("../../src/api/copy/index.js");

const story = (id: number) => ({
    id,
    uuid: `uuid-${id}`,
    full_slug: `s/${id}`,
    slug: String(id),
    name: `s${id}`,
    is_folder: false,
    published: false,
    unpublished_changes: false,
    updated_at: "2026-08-17T00:00:00.000Z",
    content: { component: "page", _uid: "u", title: `t${id}` },
});

const baseArgs = (manifestRoot: string, stories: any[]) => ({
    tree: stories.map((s) => ({ id: s.id, story: s, children: [] })),
    realParentId: null,
    sourceStoryById: new Map(stories.map((s) => [s.id, s])),
    targetSlugBySourceSlug: new Map(
        stories.map((s) => [s.full_slug, s.full_slug]),
    ),
    publication: { mode: "save-only" as const },
    publishedLayerRecordBySourceId: new Map(),
    sourceSpace: "1",
    targetSpace: "2",
    manifestRoot,
    forceContent: false,
    writeConcurrency: 4,
});

const seedShellMapping = async (manifestRoot: string, s: any) => {
    const paths = getDefaultCopyManifestPaths({
        sourceSpaceId: "1",
        targetSpaceId: "2",
        rootDir: manifestRoot,
    });
    await appendManifestEntry(paths.combined, {
        type: "story",
        source_space_id: "1",
        target_space_id: "2",
        source_id: s.id,
        target_id: s.id + 1000,
        source_uuid: s.uuid,
        target_uuid: `t-${s.uuid}`,
        source_full_slug: s.full_slug,
        target_full_slug: s.full_slug,
        action: "created",
        created_at: "2026-08-17T00:00:00.000Z",
    } as any);
};

describe("rewriteCopiedStoryContents (checkpointed)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "sbmig-rewrite-"),
        );
        updateStory.mockReset();
        updateStory.mockResolvedValue({ ok: true, stage: "update" });
        // Reset so a `mockResolvedValueOnce` queued by one test can never
        // leak into and silently change the schema registry seen by the
        // next test.
        getAllComponents.mockReset();
        getAllComponents.mockResolvedValue([]);
    });

    it("updates every story on the first run and writes checkpoints", async () => {
        const stories = [story(1), story(2)];
        for (const s of stories) await seedShellMapping(manifestRoot, s);
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, stories),
        );
        expect(result.updatedStories).toBe(2);
        expect(result.skippedStories).toBe(0);
        expect(updateStory).toHaveBeenCalledTimes(2);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(2);
    });

    it("skips checkpointed stories on the second run with zero api calls", async () => {
        const stories = [story(1)];
        await seedShellMapping(manifestRoot, stories[0]);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, stories));
        updateStory.mockClear();
        const second = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, stories),
        );
        expect(second.skippedStories).toBe(1);
        expect(second.updatedStories).toBe(0);
        expect(updateStory).not.toHaveBeenCalled();
    });

    it("re-updates when the source content changed", async () => {
        const s = story(1);
        await seedShellMapping(manifestRoot, s);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, [s]));
        updateStory.mockClear();
        const edited = { ...s, content: { ...s.content, title: "changed" } };
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, [edited]),
        );
        expect(result.updatedStories).toBe(1);
        expect(updateStory).toHaveBeenCalledTimes(1);
    });

    it("--force-content ignores checkpoints", async () => {
        const s = story(1);
        await seedShellMapping(manifestRoot, s);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, [s]));
        updateStory.mockClear();
        const result = await rewriteCopiedStoryContents({
            ...baseArgs(manifestRoot, [s]),
            forceContent: true,
        });
        expect(result.updatedStories).toBe(1);
    });

    it("a failed story gets no checkpoint and the phase still throws at the end", async () => {
        const stories = [story(1), story(2)];
        for (const s of stories) await seedShellMapping(manifestRoot, s);
        updateStory
            .mockResolvedValueOnce({
                ok: false,
                status: 422,
                response: "nope",
            })
            .mockResolvedValue({ ok: true });
        await expect(
            rewriteCopiedStoryContents(baseArgs(manifestRoot, stories)),
        ).rejects.toThrow(/1 story/);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(1);
    });

    it("reports zero unresolved_refs when the story's only reference is already mapped", async () => {
        // Non-vacuous: the scanner must actually find and resolve a real
        // reference here, not just see an unregistered component and scan
        // nothing at all (which would also report 0, but for the wrong
        // reason and without exercising the resolution logic).
        getAllComponents.mockResolvedValueOnce([
            { name: "page", schema: { link: { type: "multilink" } } },
        ]);
        const target = story(2);
        await seedShellMapping(manifestRoot, target);
        const s = {
            ...story(1),
            content: {
                component: "page",
                _uid: "u",
                link: { linktype: "story", id: target.id },
            },
        };
        await seedShellMapping(manifestRoot, s);
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, [s]),
        );
        expect(result.updatedStories).toBe(1);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(1);
        expect((checkpoints[0] as any).unresolved_refs).toBe(0);
    });

    it("counts an in-scope story-uuid reference with no manifest mapping as unresolved", async () => {
        const REFERENCED_UUID = "11111111-1111-1111-1111-111111111111";
        getAllComponents.mockResolvedValueOnce([
            { name: "page", schema: { link: { type: "multilink" } } },
        ]);
        const s = {
            ...story(1),
            content: {
                component: "page",
                _uid: "u",
                link: { linktype: "story", id: REFERENCED_UUID },
            },
        };
        // referencedStory is part of this copy's selection (present in
        // sourceStoryById) but never got a manifest mapping. It must count
        // as unresolved -- same as the out-of-scope case below, since
        // resolvability is decided purely against `maps`, not scope.
        const referencedStory = { ...story(2), uuid: REFERENCED_UUID };
        await seedShellMapping(manifestRoot, s);
        const args = {
            ...baseArgs(manifestRoot, [s]),
            sourceStoryById: new Map<number, any>([
                [s.id, s],
                [referencedStory.id, referencedStory],
            ]),
        };
        const result = await rewriteCopiedStoryContents(args);
        expect(result.updatedStories).toBe(1);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(1);
        expect((checkpoints[0] as any).unresolved_refs).toBeGreaterThan(0);
    });

    it("counts an out-of-scope story-uuid reference with no mapping as unresolved", async () => {
        // This is the branch an earlier, scope-based version of
        // countUnresolvedRefs got wrong: it treated "not part of this run's
        // own selection" as "deliberately preserved external link, don't
        // count" and reported unresolved_refs: 0 forever, even though a
        // LATER, separate copy run could map this same uuid and this
        // reference would never get revisited to pick it up. Resolvability
        // must be decided purely against `maps`, regardless of scope.
        const REFERENCED_UUID = "22222222-2222-2222-2222-222222222222";
        getAllComponents.mockResolvedValueOnce([
            { name: "page", schema: { link: { type: "multilink" } } },
        ]);
        const s = {
            ...story(1),
            content: {
                component: "page",
                _uid: "u",
                link: { linktype: "story", id: REFERENCED_UUID },
            },
        };
        await seedShellMapping(manifestRoot, s);
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, [s]),
        );
        expect(result.updatedStories).toBe(1);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(1);
        expect((checkpoints[0] as any).unresolved_refs).toBeGreaterThan(0);
    });

    it("skips descendants of a failed replacement shell instead of reparenting them at the root", async () => {
        const parent = story(1);
        const child = story(2);
        // parent is intentionally NOT seeded with a shell mapping, and
        // getStoryBySlug/createStory aren't mocked in this file, so the
        // rewrite phase's own createOrMatchReplacementShell retry throws
        // for it -- exactly like a real, persistent shell-creation failure.
        await seedShellMapping(manifestRoot, child);

        const args = {
            tree: [
                {
                    id: parent.id,
                    story: parent,
                    children: [{ id: child.id, story: child, children: [] }],
                },
            ],
            realParentId: 900,
            sourceStoryById: new Map([
                [parent.id, parent],
                [child.id, child],
            ]),
            targetSlugBySourceSlug: new Map([
                [parent.full_slug, parent.full_slug],
                [child.full_slug, child.full_slug],
            ]),
            publication: { mode: "save-only" as const },
            publishedLayerRecordBySourceId: new Map(),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            forceContent: false,
            writeConcurrency: 4,
        };

        await expect(rewriteCopiedStoryContents(args)).rejects.toThrow(
            /1 story/,
        );
        // The child already has its own valid shell mapping (id 1002), so
        // without skippedBranch propagation it would still get updated --
        // just with the wrong parent_id (realParentId, the destination
        // root) instead of being skipped along with its failed parent.
        expect(updateStory).not.toHaveBeenCalled();
    });
});
