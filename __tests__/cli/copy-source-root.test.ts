import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    getStoriesByFullSlugs: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    publishStoryLanguages: vi.fn(),
    getAllComponents: vi.fn(),
    getSpace: vi.fn(),
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
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
            getStoriesByFullSlugs: mocks.getStoriesByFullSlugs,
            createStory: mocks.createStory,
            updateStory: mocks.updateStory,
            publishStoryLanguages: mocks.publishStoryLanguages,
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        spaces: {
            getSpace: mocks.getSpace,
        },
        assets: {
            getAllAssets: mocks.getAllAssets,
            getAllAssetFolders: mocks.getAllAssetFolders,
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

import {
    copyDescription,
    mainDescription,
} from "../../src/cli/cli-descriptions.js";
import { copyCommand } from "../../src/cli/commands/copy.js";
import Logger from "../../src/utils/logger.js";

/** Every line the run printed through Logger.log, in order. */
const loggedLines = () =>
    (Logger.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
    );

const story = (
    id: number,
    fullSlug: string,
    extra: Record<string, unknown> = {},
) => ({
    id,
    name: fullSlug,
    slug: fullSlug.split("/").at(-1),
    full_slug: fullSlug,
    is_folder: false,
    parent_id: 0,
    uuid: `source-${id}-uuid`,
    content: { component: "page" },
    ...extra,
});

/**
 * Roots `a` (a story), `b/` and `c/` (folders), each folder holding one story.
 * The listing hands them back out of order, so the expansion has to sort.
 */
const sourceStories: Record<string, any> = {
    a: story(1, "a"),
    b: story(2, "b", { is_folder: true }),
    "b/x": story(3, "b/x", { parent_id: 2 }),
    c: story(4, "c", { is_folder: true }),
    "c/y": story(5, "c/y", { parent_id: 4 }),
};

const ROOTS_AS_THE_API_LISTS_THEM = ["c", "a", "b"];

describe("copy --source / (MAR-3137)", () => {
    const stdin = process.stdin as any;
    const originalIsTTY = stdin.isTTY;
    const originalExitCode = process.exitCode;
    let tempDir: string;
    let outputPath: string;
    let manifestRoot: string;
    let rootListing: any[];

    beforeEach(async () => {
        vi.clearAllMocks();
        stdin.isTTY = false;

        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-root-"));
        outputPath = path.join(tempDir, "plan.json");
        manifestRoot = path.join(tempDir, ".sb-mig");
        rootListing = ROOTS_AS_THE_API_LISTS_THEM.map(
            (slug) => sourceStories[slug],
        );

        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoryBySlug.mockImplementation(async (slug: string) =>
            sourceStories[slug] ? { story: sourceStories[slug] } : undefined,
        );
        mocks.getAllStories.mockImplementation(async (args: any) => {
            const options = args?.options ?? {};

            if (options.with_parent === 0) {
                return rootListing.map((item: any) => ({ story: item }));
            }

            const prefix = String(options.starts_with ?? "");

            return Object.values(sourceStories)
                .filter((item) => item.full_slug.startsWith(prefix))
                .map((item) => ({ story: item }));
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
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: {} },
        ]);
        mocks.getStoriesByFullSlugs.mockResolvedValue([]);
        mocks.createStory.mockResolvedValue(undefined);
        mocks.updateStory.mockResolvedValue({ ok: true });
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        mocks.getAssetById.mockResolvedValue(undefined);
    });

    afterEach(async () => {
        stdin.isTTY = originalIsTTY;
        process.exitCode = originalExitCode;
        await rm(tempDir, { recursive: true, force: true });
    });

    const runStories = (
        flagOverrides: Record<string, unknown>,
        extra: Record<string, unknown> = {},
    ) =>
        copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                destination: "/",
                dryRun: true,
                outputPath,
                manifestRoot,
                ...flagOverrides,
                ...extra,
            },
        } as any);

    const readReport = async () =>
        JSON.parse(await readFile(outputPath, "utf8"));

    const planned = (report: any) =>
        report.items.map(
            (item: any) => `${item.sourceFullSlug} -> ${item.targetFullSlug}`,
        );

    // R1 canary. Mutation that must turn it red: keep only folders in the
    // expansion (`listSourceRootItems` filtering on `is_folder`) — the root
    // story `a` then goes missing from the plan.
    it("plans --source / exactly as the hand-typed root list, in the same order", async () => {
        await runStories({ source: "/" });
        const wholeSpace = planned(await readReport());

        await runStories({ source: "a,b,c" });
        const handTyped = planned(await readReport());

        expect(wholeSpace).toEqual(handTyped);
        expect(wholeSpace).toEqual([
            "a -> a",
            "b -> b",
            "b/x -> b/x",
            "c -> c",
            "c/y -> c/y",
        ]);
    });

    // R2 canary. Mutation that must turn it red: cap the expansion at the
    // first 100 roots (`rootItems.slice(0, 100)`), the size of one API page.
    it("keeps every root the listing returns, past a single page", async () => {
        rootListing = Array.from({ length: 150 }, (_, index) =>
            story(1000 + index, `root-${String(index).padStart(3, "0")}`),
        );
        for (const item of rootListing) {
            sourceStories[item.full_slug] = item;
        }

        await runStories({ source: "/" });

        const report = await readReport();

        expect(report.normalized.roots).toHaveLength(150);
        expect(report.items).toHaveLength(150);

        for (const item of rootListing) {
            delete sourceStories[item.full_slug];
        }
    });

    // R2: no filter rides along with the parentless listing — `in_trash=false`
    // next to it makes Storyblok answer with trashed items too.
    it("asks for the roots with with_parent and nothing else", async () => {
        await runStories({ source: "/" });

        const rootCall = mocks.getAllStories.mock.calls.find(
            (call: any) => call[0]?.options?.with_parent === 0,
        );

        expect(rootCall).toBeDefined();
        expect(Object.keys(rootCall![0].options)).toEqual(["with_parent"]);
        expect(rootCall![1]).toMatchObject({ spaceId: "source-space" });
    });

    // R3 canary. Mutation that must turn it red: drop the children check in
    // `resolveCopySelections`.
    it("refuses --mode children with / before reading anything", async () => {
        await expect(
            runStories({ source: "/", mode: "children" }),
        ).rejects.toThrow(
            "--source / already means everything under the space root; --mode children cannot be combined with it.",
        );

        expect(mocks.getAllStories).not.toHaveBeenCalled();
        expect(mocks.getStoryBySlug).not.toHaveBeenCalled();
    });

    it("still takes --mode self with /", async () => {
        await runStories({ source: "/", mode: "self" });

        expect(planned(await readReport())).toEqual([
            "a -> a",
            "b -> b",
            "c -> c",
        ]);
    });

    // R4 canary. It pins that the expansion happens before the dedupe: a root
    // named next to / is planned once, not twice.
    it("plans --source /,b exactly as --source /", async () => {
        await runStories({ source: "/" });
        const wholeSpace = planned(await readReport());

        await runStories({ source: "/,b" });

        expect(planned(await readReport())).toEqual(wholeSpace);
    });

    // R5 canary. Mutation that must turn it red: ignore `--exclude` in
    // `expandWholeSpaceSelections` (drop the `excludedSlugs` filter).
    it("drops an excluded root, planning what the remaining roots plan", async () => {
        await runStories({ source: "/", exclude: "b" });
        const excluded = planned(await readReport());

        await runStories({ source: "a,c" });

        expect(excluded).toEqual(planned(await readReport()));
        expect(excluded).toEqual(["a -> a", "c -> c", "c/y -> c/y"]);
    });

    it("takes an excluded root with its trailing slash", async () => {
        await runStories({ source: "/", exclude: "b/" });

        expect(planned(await readReport())).toEqual([
            "a -> a",
            "c -> c",
            "c/y -> c/y",
        ]);
    });

    // R5: both refusals.
    it("refuses --exclude without --source /", async () => {
        await expect(
            runStories({ source: "a", exclude: "b" }),
        ).rejects.toThrow("--exclude only applies to --source /.");
    });

    it("names the real roots when --exclude is not one of them", async () => {
        await expect(
            runStories({ source: "/", exclude: "nope" }),
        ).rejects.toThrow(
            "--exclude 'nope' is not a root of space source-space. Roots: a, b/, c/.",
        );

        expect(mocks.createStory).not.toHaveBeenCalled();
    });

    // R6 canary. Mutation that must turn it red: return an empty selection
    // list from `expandWholeSpaceSelections` instead of throwing.
    it("refuses a source space with no roots, by name", async () => {
        rootListing = [];

        await expect(runStories({ source: "/" })).rejects.toThrow(
            "Space source-space has no stories or folders to copy.",
        );

        expect(mocks.createStory).not.toHaveBeenCalled();
    });

    // R7 canary. Mutation that must turn it red: return `[]` from
    // `formatCopySelectionsLine` when an expansion is present, so / prints
    // nothing about what it meant.
    it("says what / meant, in the source line and in the PLAN block", async () => {
        await runStories({ source: "/" });

        expect(loggedLines()).toContain(
            "Sources: / -> 3 roots of space source-space",
        );

        vi.mocked(Logger.log).mockClear();

        await runStories({ source: "/" }, { dryRun: false, yes: true });

        const lines = loggedLines();

        expect(lines).toContain(
            "  selections: / -> 3 roots (3 stories, 2 folders after dedupe)",
        );
        expect(lines).toContain("    a, b/, c/");
    });

    // R7: --exclude adds its own line, under the roots.
    it("names the excluded roots on their own PLAN line", async () => {
        await runStories(
            { source: "/", exclude: "b" },
            { dryRun: false, yes: true },
        );

        const lines = loggedLines();

        expect(lines).toContain(
            "  selections: / -> 2 roots (2 stories, 1 folder after dedupe)",
        );
        expect(lines).toContain("    a, c/");
        expect(lines).toContain("    excluded: b/");
    });

    it("leaves the hand-typed selections line exactly as it was", async () => {
        await runStories({ source: "a,b" }, { dryRun: false, yes: true });

        const lines = loggedLines();

        expect(lines).toContain(
            "Sources 'a' (mode 'subtree'), 'b' (mode 'subtree'), destination '/'.",
        );
        expect(lines).toContain(
            "  selections: 2 (2 stories, 1 folder after dedupe)",
        );
    });

    // R8 canary. Mutation that must turn it red: fold the expansion into
    // `normalized.source` (report the roots as the source).
    it("reports / as the source and the roots next to it", async () => {
        await runStories({ source: "/" });

        const report = await readReport();

        expect(report.input.source).toBe("/");
        expect(report.normalized.source).toBe("/");
        expect(report.normalized.roots).toEqual(["a", "b", "c"]);
        expect(report.normalized).not.toHaveProperty("excluded");
    });

    it("reports what --exclude took out", async () => {
        await runStories({ source: "/", exclude: "b" });

        const report = await readReport();

        expect(report.input.exclude).toBe("b");
        expect(report.normalized.source).toBe("/");
        expect(report.normalized.roots).toEqual(["a", "c"]);
        expect(report.normalized.excluded).toEqual(["b"]);
    });

    // R9 canary. Mutation that must turn it red: hand `collectSelectionForest`
    // the unexpanded selections in the relink call site — / is then resolved
    // as a slug and the run throws "Source story or folder not found: /".
    it("takes the same selector in copy relink", async () => {
        await copyCommand({
            input: ["copy", "relink"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "/",
                destination: "/",
                dryRun: true,
                outputPath,
                manifestRoot,
            },
        } as any);

        const report = await readReport();

        expect(report.command).toBe("copy relink");
        expect(report.normalized.source).toBe("/");
        expect(report.normalized.roots).toEqual(["a", "b", "c"]);
        expect(loggedLines()).toContain(
            "Sources: / -> 3 roots of space source-space",
        );
        expect(report.items.length).toBeGreaterThan(0);
    });

    // R10.
    describe("the help says so", () => {
        it("documents / on --source and lists --exclude", () => {
            expect(copyDescription).toContain(
                "Use / to select every root story and folder of the source space",
            );
            expect(copyDescription).toContain("--exclude");
            expect(copyDescription).toContain(
                "Only valid together with --source /. [stories and relink]",
            );
        });

        it("shows the whole-space run in USAGE and EXAMPLES", () => {
            expect(copyDescription).toContain(
                "$ sb-mig copy stories --from [spaceId] --to [spaceId] --source / --destination /",
            );
            expect(mainDescription).toContain(
                "$ sb-mig copy stories --from 12345 --to 67890 --source / --destination /",
            );
        });

        it("warns that a root added later is picked up on the next run", () => {
            expect(copyDescription).toContain(
                "a story or folder added to the source root later is included by / the next time",
            );
        });
    });
});
