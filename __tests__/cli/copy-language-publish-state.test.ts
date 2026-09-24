import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MAR-3076: copy relink keeps each LANGUAGE's publish state. Every test drives
 * the real command and reads what it did — the languages on the mocked publish
 * call, the printed PLAN, and the report JSON — never the planner itself. The
 * harness is MAR-3163's relink fixture; the target here has de, pl and fr.
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

describe("copy relink keeps each language's publish state (MAR-3076)", () => {
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

    /** The target space: its publish setting, and de, pl, fr. */
    const setTarget = ({ perLanguage }: { perLanguage: boolean }) => {
        const languages = [{ code: "de" }, { code: "pl" }, { code: "fr" }];

        mocks.getSpace.mockResolvedValue({
            space: { use_translated_stories: perLanguage, languages },
        });
        // What the apply resolves `--publicationLanguages all` from.
        mocks.sbApiGet.mockResolvedValue({ data: { space: { languages } } });
    };
    /** One story's translations, as the Management story carries them. */
    const withTranslations = (
        story: ReturnType<typeof post>,
        entries: Array<{ lang: string; unpublished_changes: boolean }>,
    ) => ({
        ...story,
        target: { ...story.target, translated_stories: entries },
    });
    const publishedLanguagesOf = (id: number) =>
        mocks.publishStoryLanguages.mock.calls
            .filter((call) => Number(call[0]?.storyId) === id)
            .map((call) => call[0].languages);
    const languagesLine = () =>
        logLines().find((line) => line.startsWith("  languages: "));

    // R1 canary. Mutation that must turn it red: ignore the setting, so a
    // space that publishes every language together is filtered anyway.
    it("publishes every language together when the target does, and says so", async () => {
        setTarget({ perLanguage: false });
        posts = [
            withTranslations(clean, [{ lang: "de", unpublished_changes: false }]),
        ];

        const report = await run();

        expect(publishedLanguagesOf(1002)).toEqual([
            ["[default]", "de", "pl", "fr"],
        ]);
        expect(languagesLine()).toBe(
            "  languages: this space publishes all languages together (use_translated_stories off) — a published story goes live in every language",
        );
        expect(itemOf(report, "clean")).toMatchObject({
            outcome: "published",
            publishedLanguages: ["[default]", "de", "pl", "fr"],
            leftLanguages: [],
        });
    });

    // R3 canary. Mutations that must turn it red: publish the whole resolved
    // set; publish the dirty fr outside the published-layer path.
    // R4 canary. Mutation that must turn it red: the line and the report
    // disagree.
    it("publishes only the live, clean languages, and lists the others", async () => {
        setTarget({ perLanguage: true });
        posts = [
            withTranslations(clean, [
                { lang: "de", unpublished_changes: false },
                { lang: "fr", unpublished_changes: true },
            ]),
        ];

        const report = await run();

        expect(publishedLanguagesOf(1002)).toEqual([["[default]", "de"]]);
        expect(itemOf(report, "clean")).toMatchObject({
            outcome: "published",
            publishedLanguages: ["[default]", "de"],
            leftLanguages: [
                { code: "pl", state: "not_published" },
                { code: "fr", state: "published_with_unpublished_changes" },
            ],
        });
        // The PLAN said the same before the first write.
        expect(languagesLine()).toBe(
            "  languages: 0 stories publish in all their live languages; 1 stories keep 1 unpublished translation(s) unpublished; 1 translation(s) with unpublished changes left as they are",
        );
        // The old MAR-3076 note is gone.
        expect(
            logLines().some((line) => line.includes("not reproduced yet")),
        ).toBe(false);
    });

    it("publishes a translation with unpublished changes only from the published layer", async () => {
        setTarget({ perLanguage: true });
        posts = [
            withTranslations(dirty, [
                { lang: "de", unpublished_changes: false },
                { lang: "fr", unpublished_changes: true },
            ]),
        ];

        const report = await run();

        // What goes live is the published layer, so fr's live version is
        // what fr publishes; pl was never live and stays that way.
        expect(eventsFor(1004)).toEqual([
            "put(TARGET LIVE, cta 1001)",
            "publish",
            "put(Draft of dirty, cta 1001)",
        ]);
        expect(publishedLanguagesOf(1004)).toEqual([["[default]", "de", "fr"]]);
        expect(itemOf(report, "dirty").leftLanguages).toEqual([
            { code: "pl", state: "not_published" },
        ]);
    });

    it("names why a story with unpublished changes and no history is listed", async () => {
        setTarget({ perLanguage: true });
        versionsBySpace["target-space"] = [];
        posts = [dirty];

        await run({ dryRun: true });

        expect(logLines()).toContain(
            "    listed: imported/blog/dirty (dirty_without_published_layer: dirty (a translation or the default language has unpublished changes))",
        );
    });

    // R5 canary. Mutation that must turn it red: decide the languages from
    // the story as first read instead of the re-read before the publish.
    it("reads the space once, and lets the re-read story decide the languages", async () => {
        setTarget({ perLanguage: true });
        posts = [
            withTranslations(clean, [{ lang: "de", unpublished_changes: false }]),
        ];
        // Between the read and the write, de gained unpublished changes; the
        // story's version marker did not move, so the write goes ahead.
        mocks.getStoryById.mockResolvedValue({
            story: {
                ...posts[0]!.target,
                translated_stories: [{ lang: "de", unpublished_changes: true }],
            },
        });

        await run();

        expect(publishedLanguagesOf(1002)).toEqual([["[default]"]]);
        // One read of the space for the setting, and no other space read.
        expect(mocks.getSpace).toHaveBeenCalledTimes(1);
    });
});
