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

    it("reports zero unresolved_refs for a story with no references", async () => {
        const s = story(1);
        await seedShellMapping(manifestRoot, s);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, [s]));
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
        // sourceStoryById) but never got a manifest mapping, so the
        // reference to it must count as unresolved rather than as a
        // deliberately preserved external link.
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
});
