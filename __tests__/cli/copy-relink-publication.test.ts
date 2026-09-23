import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MAR-3163: copy relink keeps every story's publication state. Every test
 * drives the real command and reads what it did — the ordered writes on the
 * mocked Storyblok client, the printed PLAN, and the report JSON — never the
 * planner itself.
 */
const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getStoryVersions: vi.fn(),
    publishStoryLanguages: vi.fn(),
    getSpace: vi.fn(),
    getAllComponents: vi.fn(),
    getAssetById: vi.fn(),
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

/** A link into the source folder: what a copy leaves behind, to be repaired. */
const brokenLink = { linktype: "story", id: 1, uuid: "source-blog-uuid" };
const repairedLink = { linktype: "story", id: 1001, uuid: "target-blog-uuid" };

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

const targetFolder = {
    id: 1001,
    name: "Blog",
    slug: "blog",
    full_slug: "imported/blog",
    is_folder: true,
    uuid: "target-blog-uuid",
};

/** One source post and its copy, in a given publication state. */
const post = (
    n: number,
    slug: string,
    state: Record<string, unknown>,
    title = `Draft of ${slug}`,
) => ({
    source: {
        id: n,
        name: slug,
        slug,
        full_slug: `blog/${slug}`,
        is_folder: false,
        parent_id: 1,
        uuid: `source-${slug}-uuid`,
        content: { component: "page", title, cta: brokenLink },
    },
    target: {
        id: 1000 + n,
        name: slug,
        slug,
        full_slug: `imported/blog/${slug}`,
        is_folder: false,
        parent_id: 1001,
        uuid: `target-${slug}-uuid`,
        updated_at: "2026-09-23T08:00:00.000Z",
        content: { component: "page", title, cta: brokenLink },
        ...state,
    },
});

const clean = post(2, "clean", { published: true, unpublished_changes: false });
const draft = post(3, "draft", { published: false });
const dirty = post(4, "dirty", { published: true, unpublished_changes: true });
// `unpublished_changes` missing: the story does not say what is live.
const unknown = post(5, "unknown", { published: true });

let posts = [clean, draft, dirty, unknown];

/**
 * The TARGET's own history for the dirty story holds the version readers see
 * today; the SOURCE's history holds something else entirely (it moved on after
 * the duplicate was made). Relink must repair the target's.
 */
const versionsBySpace: Record<string, any[]> = {};

const relinkFlags = (extra: Record<string, unknown> = {}) => ({
    input: ["copy", "relink"],
    flags: {
        from: "source-space",
        to: "target-space",
        source: "blog",
        destination: "imported",
        yes: true,
        ...extra,
    },
});

/** Every write and publish, in the order the client saw them. */
const events = () => {
    const puts = mocks.updateStory.mock.calls.map((call, index) => ({
        at: mocks.updateStory.mock.invocationCallOrder[index]!,
        kind: "put" as const,
        id: Number(call[1]),
        publish: call[2]?.publish,
        title: call[0]?.content?.title,
        cta: call[0]?.content?.cta,
    }));
    const publishes = mocks.publishStoryLanguages.mock.calls.map(
        (call, index) => ({
            at: mocks.publishStoryLanguages.mock.invocationCallOrder[index]!,
            kind: "publish" as const,
            id: Number(call[0]?.storyId),
        }),
    );

    return [...puts, ...publishes].sort((a, b) => a.at - b.at);
};

const eventsFor = (id: number) =>
    events()
        .filter((event) => event.id === id)
        .map((event) =>
            event.kind === "publish"
                ? "publish"
                : `put(${event.title}, cta ${event.cta?.id})`,
        );

const logLines = () =>
    [
        ...vi.mocked(Logger.log).mock.calls,
        ...vi.mocked(Logger.warning).mock.calls,
        ...vi.mocked(Logger.success).mock.calls,
        ...vi.mocked(Logger.error).mock.calls,
    ].map((call) => String(call[0]));

describe("copy relink keeps each story's publication state (MAR-3163)", () => {
    let tempDir: string;
    const originalExitCode = process.exitCode;

    const run = async (extra: Record<string, unknown> = {}) => {
        const outputPath = path.join(tempDir, "relink-report.json");

        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                outputPath,
                ...extra,
            }) as any,
        );

        return JSON.parse(await readFile(outputPath, "utf8"));
    };

    const itemOf = (report: any, slug: string) =>
        report.items.find(
            (item: any) => item.targetFullSlug === `imported/blog/${slug}`,
        );

    beforeEach(async () => {
        vi.clearAllMocks();
        process.exitCode = undefined;
        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-relink-pub-"));
        posts = [clean, draft, dirty, unknown];
        versionsBySpace["target-space"] = [
            {
                id: 91,
                status: "published",
                created_at: "2026-09-20T10:00:00.000Z",
                content: {
                    component: "page",
                    title: "TARGET LIVE",
                    cta: brokenLink,
                },
            },
        ];
        versionsBySpace["source-space"] = [
            {
                id: 81,
                status: "published",
                created_at: "2026-09-23T10:33:00.000Z",
                content: {
                    component: "page",
                    title: "SOURCE LIVE (never in the target)",
                    cta: brokenLink,
                },
            },
        ];

        mocks.getStoryBySlug.mockImplementation((slug: string) => {
            if (slug === "blog") {
                return Promise.resolve({ story: sourceFolder });
            }

            if (slug === "imported") {
                return Promise.resolve({
                    story: {
                        id: 900,
                        slug: "imported",
                        full_slug: "imported",
                        is_folder: true,
                        uuid: "target-imported-uuid",
                    },
                });
            }

            if (slug === "imported/blog") {
                return Promise.resolve({ story: targetFolder });
            }

            const match = posts.find((p) => p.target.full_slug === slug);

            return Promise.resolve(match ? { story: match.target } : undefined);
        });
        mocks.getAllStories.mockImplementation(() =>
            Promise.resolve(posts.map((p) => ({ story: p.source }))),
        );
        mocks.createTree.mockImplementation((stories: any[]) => {
            const root = stories.find((story) => story.is_folder);

            return [
                {
                    id: root.id,
                    story: root,
                    children: stories
                        .filter((story) => !story.is_folder)
                        .map((story) => ({
                            id: story.id,
                            story,
                            children: [],
                        })),
                },
            ];
        });
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: { cta: { type: "multilink" } } },
        ]);
        mocks.getAssetById.mockResolvedValue(undefined);
        mocks.updateStory.mockResolvedValue({ ok: true });
        mocks.publishStoryLanguages.mockResolvedValue({
            ok: true,
            stage: "publish",
        });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        // The re-read before a publish: nothing changed since relink read it.
        mocks.getStoryById.mockImplementation((id: string) =>
            Promise.resolve({
                story: posts.find((p) => String(p.target.id) === String(id))
                    ?.target,
            }),
        );
        mocks.getStoryVersions.mockImplementation((_args: any, config: any) =>
            Promise.resolve({
                story_versions: versionsBySpace[config.spaceId] ?? [],
            }),
        );
    });

    afterEach(async () => {
        process.exitCode = originalExitCode;
        await rm(tempDir, { recursive: true, force: true });
    });

    // R1 canary. Mutations that must turn it red: publish every updated story
    // (the dirty and unknown stories' drafts go live); publish none (the
    // clean story stays live with its old references).
    it("republishes what was live, saves what was not, and never publishes a draft", async () => {
        const report = await run();

        // clean: the repair is saved, then published.
        expect(eventsFor(1002)).toEqual([
            "put(Draft of clean, cta 1001)",
            "publish",
        ]);
        // draft: saved only.
        expect(eventsFor(1003)).toEqual(["put(Draft of draft, cta 1001)"]);
        // dirty: the target's published layer, repaired, is what goes live;
        // the repaired draft is put back after the publish.
        expect(eventsFor(1004)).toEqual([
            "put(TARGET LIVE, cta 1001)",
            "publish",
            "put(Draft of dirty, cta 1001)",
        ]);
        // unknown: saved as a draft, never published.
        expect(eventsFor(1005)).toEqual(["put(Draft of unknown, cta 1001)"]);
        // Every PUT is a save; only the publish call ever publishes.
        expect(
            mocks.updateStory.mock.calls.every(
                (call) => call[2]?.publish === false,
            ),
        ).toBe(true);

        expect(
            ["clean", "draft", "dirty", "unknown"].map((slug) => [
                slug,
                itemOf(report, slug).outcome,
            ]),
        ).toEqual([
            ["clean", "published"],
            ["draft", "updated"],
            ["dirty", "published"],
            ["unknown", "updated"],
        ]);
        expect(itemOf(report, "unknown").reason).toBe("published_state_unknown");
        // Folders are never published.
        expect(eventsFor(1001)).toEqual([]);
    });

    // R2 canary. Mutation that must turn it red: read the published layer
    // from the SOURCE space.
    it("repairs the target's own published version, never the source's", async () => {
        posts = [dirty];

        await run();

        expect(eventsFor(1004)[0]).toBe("put(TARGET LIVE, cta 1001)");
        expect(
            mocks.getStoryVersions.mock.calls.map((call) => call[1].spaceId),
        ).toEqual(["target-space"]);
        expect(
            mocks.updateStory.mock.calls.some(
                (call) => call[0]?.content?.title?.startsWith("SOURCE LIVE"),
            ),
        ).toBe(false);
    });

    // R2 canary. Mutation that must turn it red: publish the draft when the
    // target has no published version to repair.
    it("saves a dirty story without a published version as a draft, and lists it", async () => {
        posts = [dirty];
        versionsBySpace["target-space"] = [];

        const report = await run();

        expect(eventsFor(1004)).toEqual(["put(Draft of dirty, cta 1001)"]);
        expect(mocks.publishStoryLanguages).not.toHaveBeenCalled();
        expect(itemOf(report, "dirty")).toMatchObject({
            outcome: "updated",
            publication: "draft_only_listed",
            reason: "dirty_without_published_layer",
        });
        expect(logLines()).toContain(
            "    listed: imported/blog/dirty (dirty_without_published_layer)",
        );
    });

    // R3 canary. Mutation that must turn it red: skip the re-read.
    it("writes nothing to a story someone changed after relink read it", async () => {
        posts = [clean];
        mocks.getStoryById.mockResolvedValue({
            story: { ...clean.target, updated_at: "2026-09-23T12:00:00.000Z" },
        });

        const report = await run();

        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(mocks.publishStoryLanguages).not.toHaveBeenCalled();
        expect(itemOf(report, "clean")).toMatchObject({
            outcome: "changed_since_read",
            reason: "changed_since_read",
        });
        expect(report.summary.changed_since_read).toBe(1);
        // A rerun picks it up; it is not a failure.
        expect(process.exitCode).toBeUndefined();
    });

    it("saves every repair and publishes nothing with --publicationMode save-only", async () => {
        const report = await run({ publicationMode: "save-only" });

        expect(mocks.publishStoryLanguages).not.toHaveBeenCalled();
        expect(mocks.getStoryVersions).not.toHaveBeenCalled();
        expect(mocks.updateStory).toHaveBeenCalledTimes(4);
        expect(report.summary).toMatchObject({
            republished: 0,
            savedOnly: 4,
            fromHistory: 0,
            listed: 0,
            published: 0,
        });
        expect(logLines()).toContain(
            "  publication: save-only — 4 repair(s) saved as drafts; nothing is published",
        );
    });

    // R4 canary. Mutation that must turn it red: accept collapse-draft.
    it("refuses --publicationMode collapse-draft before reading anything", async () => {
        await copyCommand(
            relinkFlags({
                manifestRoot: path.join(tempDir, ".sb-mig"),
                publicationMode: "collapse-draft",
            }) as any,
        );

        expect(process.exitCode).toBe(1);
        expect(mocks.getStoryBySlug).not.toHaveBeenCalled();
        expect(mocks.getAllStories).not.toHaveBeenCalled();
        expect(mocks.getSpace).not.toHaveBeenCalled();
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(vi.mocked(Logger.error).mock.calls.map((c) => c[0])).toEqual([
            "--publicationMode collapse-draft is not available for copy relink: it would publish unfinished drafts. Use preserve-layers (the default) or save-only.",
        ]);
    });

    // R5 canary. Mutation that must turn it red: drop the fourth number
    // from the publication line.
    it("says the publication plan in four numbers, the same in the PLAN and the report", async () => {
        versionsBySpace["target-space"] = [];

        const dryRun = await run({ dryRun: true });
        const line = logLines().find((entry) =>
            entry.startsWith("  publication: "),
        );

        expect(line).toBe(
            "  publication: 1 published — republished with the repair; 1 drafts — saved only; 0 with unpublished changes — live version repaired from its history; 2 with unpublished changes and no published version — draft only, listed",
        );
        expect(dryRun.summary).toEqual({
            republished: 1,
            savedOnly: 1,
            fromHistory: 0,
            listed: 2,
        });
        // They add up to the stories relink writes.
        expect(
            dryRun.items.filter((item: any) => item.changed).length,
        ).toBe(4);
        // The dry-run wrote nothing and published nothing.
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(mocks.publishStoryLanguages).not.toHaveBeenCalled();
        // It read the version history of the dirty story only.
        expect(mocks.getStoryVersions).toHaveBeenCalledTimes(1);
        expect(mocks.getStoryVersions.mock.calls[0]![0]).toMatchObject({
            storyId: "1004",
        });
        // And it never says the repair is "in the DRAFT only" any more.
        expect(
            logLines().some((entry) => entry.includes("DRAFT only")),
        ).toBe(false);
    });

    // R6 canary. Mutation that must turn it red: record a refused publish as
    // a successful update.
    it("keeps the repair when the publish is refused, and says so", async () => {
        posts = [clean];
        mocks.publishStoryLanguages.mockResolvedValue({
            ok: false,
            stage: "publish",
            status: 422,
        });

        const report = await run();

        expect(eventsFor(1002)).toEqual([
            "put(Draft of clean, cta 1001)",
            "publish",
        ]);
        expect(itemOf(report, "clean").outcome).toBe("publish_failed");
        expect(report.failures).toEqual([
            expect.objectContaining({
                resource: "story",
                path: "imported/blog/clean",
                phase: "publish",
                status: 422,
            }),
        ]);
        expect(report.summary).toMatchObject({
            publish_failed: 1,
            published: 0,
            updatedStories: 1,
        });
        expect(process.exitCode).toBe(1);
    });

    it("puts a dirty story's draft back even when its publish is refused", async () => {
        posts = [dirty];
        mocks.publishStoryLanguages.mockResolvedValue({
            ok: false,
            stage: "publish",
            status: 422,
        });

        const report = await run();

        // Without the last PUT, the author's unpublished changes would be
        // gone: the draft slot would still hold the published layer.
        expect(eventsFor(1004)).toEqual([
            "put(TARGET LIVE, cta 1001)",
            "publish",
            "put(Draft of dirty, cta 1001)",
        ]);
        expect(itemOf(report, "dirty").outcome).toBe("publish_failed");
    });
});
