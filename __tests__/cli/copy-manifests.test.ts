import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    getAllComponents: vi.fn(),
    getAllAssets: vi.fn(),
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
        },
        components: {
            getAllComponents: mocks.getAllComponents,
        },
        assets: {
            getAllAssets: mocks.getAllAssets,
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
import Logger from "../../src/utils/logger.js";

const ledgerLines = () =>
    (Logger.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
    );

const errorLines = () =>
    (Logger.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => String(call[0]),
    );

const storyLine = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
        type: "story",
        source_space_id: "source-space",
        target_space_id: "target-space",
        action: "created",
        created_at: "2026-09-04T10:00:00.000Z",
        source_id: 1,
        target_id: 1001,
        source_uuid: "source-uuid-1",
        target_uuid: "target-uuid-1",
        source_full_slug: "blog/post-1",
        target_full_slug: "imported/blog/post-1",
        ...overrides,
    });

const assetLine = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
        type: "asset",
        source_space_id: "source-space",
        target_space_id: "target-space",
        action: "created",
        created_at: "2026-09-04T10:00:00.000Z",
        source_id: 9,
        target_id: 99,
        source_filename: "a.png",
        target_filename: "b.png",
        ...overrides,
    });

let tempDir: string;
let manifestRoot: string;
let exitCodeBefore: typeof process.exitCode;

const writeLedger = async (
    files: Partial<Record<"combined" | "stories", string>>,
) => {
    const dir = path.join(manifestRoot, "copy", "source-space", "target-space");
    await mkdir(dir, { recursive: true });

    if (files.combined !== undefined) {
        await writeFile(path.join(dir, "manifest.jsonl"), files.combined);
    }

    if (files.stories !== undefined) {
        await writeFile(
            path.join(dir, "stories.manifest.jsonl"),
            files.stories,
        );
    }
};

const writePairLedger = async (
    sourceSpaceId: string,
    targetSpaceId: string,
    combined: string,
) => {
    const dir = path.join(manifestRoot, "copy", sourceSpaceId, targetSpaceId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "manifest.jsonl"), combined);
};

const ledgerDir = () =>
    path.join(manifestRoot, "copy", "source-space", "target-space");

const combinedPath = () => path.join(ledgerDir(), "manifest.jsonl");

/**
 * The pair is named explicitly on every call that wants one. The default here
 * is deliberately NOT --from/--to: a no-argument run is the listing, and the
 * tests that exercise it pass nothing.
 */
const runInspector = (flags: Record<string, unknown> = {}) =>
    copyCommand({
        input: ["copy", "manifests"],
        flags: {
            manifestRoot,
            ...flags,
        },
    } as any);

const runPairInspector = (flags: Record<string, unknown> = {}) =>
    runInspector({ from: "source-space", to: "target-space", ...flags });

describe("copy manifests", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-ledger-"));
        manifestRoot = path.join(tempDir, ".sb-mig");
        exitCodeBefore = process.exitCode;
    });

    afterEach(async () => {
        process.exitCode = exitCodeBefore;
        await rm(tempDir, { recursive: true, force: true });
    });

    it("reads back a healthy ledger without touching Storyblok", async () => {
        await writeLedger({
            combined: `${storyLine()}\n${storyLine({
                source_id: 2,
                target_id: 1002,
                source_uuid: "source-uuid-2",
                target_uuid: "target-uuid-2",
                action: "matched_by_target_key",
            })}\n`,
        });

        await runPairInspector();

        expect(ledgerLines()).toContain("  pair: source-space to target-space");
        expect(ledgerLines()).toContain("  combined: 2 entries");
        expect(ledgerLines()).toContain(
            "  mappings: 2 story, 0 asset, 0 asset folder",
        );
        expect(ledgerLines()).toContain(
            "  recorded as: created 1, matched_by_target_key 1",
        );
        expect(ledgerLines()).toContain(
            "  no problems found in the ledger itself.",
        );

        // An inspector that reads the space is a different command; this one
        // must be safe to run at any moment against any pair.
        expect(mocks.getAllStories).not.toHaveBeenCalled();
        expect(mocks.getStoryBySlug).not.toHaveBeenCalled();
        expect(mocks.updateStory).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    });

    it("says nothing has been copied when the ledger was never written", async () => {
        await runPairInspector();

        expect(ledgerLines()).toContain("  combined: not written yet");
        expect(ledgerLines()).toContain(
            "  nothing has been copied between these spaces yet, or the ledger was moved aside.",
        );
        expect(process.exitCode).toBeUndefined();
    });

    it("exits 1 on a source key mapped to two different targets", async () => {
        await writeLedger({
            combined: `${storyLine()}\n${storyLine({ target_id: 5005 })}\n`,
        });

        await runPairInspector();

        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("ERROR conflicting_mapping") &&
                    line.includes("would use 5005"),
            ),
        ).toBe(true);
        expect(process.exitCode).toBe(1);
    });

    it("exits 1 on a mapping recorded only in the per-resource file", async () => {
        await writeLedger({
            combined: `${storyLine()}\n`,
            stories: `${storyLine()}\n${storyLine({
                source_id: 7,
                target_id: 1007,
                source_uuid: "source-uuid-7",
                target_uuid: "target-uuid-7",
            })}\n`,
        });

        await runPairInspector();

        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("ERROR missing_from_combined") &&
                    line.includes("story id 7"),
            ),
        ).toBe(true);
        expect(process.exitCode).toBe(1);
    });

    it("exits 1 on a ledger line that will not parse", async () => {
        await writeLedger({ combined: `${storyLine()}\nnot json\n` });

        await runPairInspector();

        expect(
            ledgerLines().some((line) =>
                line.includes("ERROR unreadable_file"),
            ),
        ).toBe(true);
        expect(ledgerLines()).toContain("  combined: unreadable");
        expect(process.exitCode).toBe(1);
    });

    it("writes the same account to the --outputPath artifact", async () => {
        const outputPath = path.join(tempDir, "reports", "ledger.json");

        await writeLedger({
            combined: `${storyLine({ target_full_slug: undefined })}\n`,
        });

        await runPairInspector({ outputPath });

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            schemaVersion: 1,
            command: "copy manifests",
            normalized: {
                sourceSpaceId: "source-space",
                targetSpaceId: "target-space",
            },
            summary: {
                entries: 1,
                stories: 1,
                storiesWithoutTargetPath: 1,
                errors: 0,
                warnings: 1,
            },
        });
        expect(report.findings[0].code).toBe("missing_target_full_slug");
        // The ledger itself is never rewritten by a read.
        expect(
            await readFile(
                path.join(
                    manifestRoot,
                    "copy",
                    "source-space",
                    "target-space",
                    "manifest.jsonl",
                ),
                "utf8",
            ),
        ).toBe(`${storyLine({ target_full_slug: undefined })}\n`);
    });

    /* --------------------------------------------------------------- *
     * The contract: no arguments lists every ledger on disk
     * --------------------------------------------------------------- */

    it("lists every ledger pair on disk when no pair is named", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });
        await writePairLedger(
            "111",
            "222",
            `${storyLine({
                source_space_id: "111",
                target_space_id: "222",
            })}\n`,
        );

        await runInspector({});

        expect(ledgerLines()).toContain("LEDGERS");
        expect(ledgerLines()).toContain("  2 pairs:");
        expect(
            ledgerLines().some((line) => line.includes("111 -> 222  1 entry")),
        ).toBe(true);
        expect(
            ledgerLines().some((line) =>
                line.includes("source-space -> target-space  1 entry"),
            ),
        ).toBe(true);
        expect(process.exitCode).toBeUndefined();
    });

    it("never falls back to the configured space when no pair is named", async () => {
        // The configured space is 'default-space'. Reading its ledger — which
        // does not exist — and reporting 'no problems found' is the exact lie
        // this command exists to stop telling.
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({});

        expect(ledgerLines()).not.toContain(
            "  no problems found in the ledger itself.",
        );
        expect(
            ledgerLines().some((line) => line.includes("default-space")),
        ).toBe(false);
        expect(ledgerLines().some((line) => line.startsWith("LEDGER\n"))).toBe(
            false,
        );
    });

    it("says so plainly when no ledger has ever been written", async () => {
        await runInspector({});

        expect(ledgerLines()).toContain(
            "  no copy ledger found under this root. One appears the first time copy stories or copy assets writes to a space pair.",
        );
        expect(process.exitCode).toBeUndefined();
    });

    it("refuses half a pair rather than guessing the other half", async () => {
        await copyCommand({
            input: ["copy", "manifests"],
            flags: { from: "source-space", manifestRoot },
        } as any);

        expect(errorLines()[0]).toContain("Name the whole pair");
        expect(process.exitCode).toBe(1);
    });

    it("refuses a --pair that is not written as source:target", async () => {
        await runInspector({ pair: "source-space" });

        expect(errorLines()[0]).toContain(
            "--pair must be written as <sourceSpaceId>:<targetSpaceId>",
        );
        expect(process.exitCode).toBe(1);
    });

    it("refuses --type, --slug and --prune without a pair to apply them to", async () => {
        await runInspector({ type: "story" });

        expect(errorLines()[0]).toContain(
            "--prune, --type and --slug all act on one ledger",
        );
        expect(process.exitCode).toBe(1);
    });

    /* --------------------------------------------------------------- *
     * The contract: --pair shows the deduped view, --type/--slug filter it
     * --------------------------------------------------------------- */

    it("shows one pair's mappings deduped, with the superseded lines collapsed", async () => {
        await writeLedger({
            combined: `${storyLine({
                target_full_slug: "imported/OLD",
            })}\n${storyLine({
                target_full_slug: "imported/NEW",
                action: "matched_by_target_key",
            })}\n`,
        });

        await runInspector({ pair: "source-space:target-space" });

        expect(ledgerLines()).toContain("MAPPINGS");
        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("1 mapping from 2 ledger lines") &&
                    line.includes("1 superseded or unusable line"),
            ),
        ).toBe(true);
        expect(
            ledgerLines().some((line) =>
                line.includes("story  blog/post-1 -> imported/NEW"),
            ),
        ).toBe(true);
    });

    it("filters the mapping view by --type and --slug", async () => {
        await writeLedger({
            combined: `${storyLine()}\n${assetLine()}\n`,
        });

        await runInspector({
            pair: "source-space:target-space",
            type: "asset",
        });

        expect(
            ledgerLines().some((line) =>
                line.includes("showing 1 matching type asset"),
            ),
        ).toBe(true);
        expect(
            ledgerLines().some((line) =>
                line.includes("asset  a.png -> b.png"),
            ),
        ).toBe(true);

        vi.clearAllMocks();

        await runInspector({
            pair: "source-space:target-space",
            slug: "post-1",
        });

        expect(
            ledgerLines().some((line) =>
                line.includes("showing 1 matching slug containing 'post-1'"),
            ),
        ).toBe(true);
    });

    it("refuses to narrow a prune, rather than quietly ignoring the filter", async () => {
        const before = `${storyLine()}\n${storyLine()}\n`;

        await writeLedger({ combined: before });

        await runInspector({
            pair: "source-space:target-space",
            prune: true,
            yes: true,
            type: "story",
        });

        expect(errorLines()[0]).toContain(
            "--prune rewrites the whole ledger and cannot be narrowed",
        );
        expect(await readFile(combinedPath(), "utf8")).toBe(before);
        expect(process.exitCode).toBe(1);
    });

    it("refuses a --type it does not know", async () => {
        await runInspector({
            pair: "source-space:target-space",
            type: "banana",
        });

        expect(errorLines()[0]).toContain(
            "--type must be one of: story, asset, asset_folder",
        );
        expect(process.exitCode).toBe(1);
    });

    /* --------------------------------------------------------------- *
     * The contract: --prune, behind the same gate every write sits behind
     * --------------------------------------------------------------- */

    it("prunes only behind the confirmation gate, and archives before rewriting", async () => {
        mocks.askYesNo.mockResolvedValue(true);

        await writeLedger({
            combined: `${storyLine({
                target_full_slug: "imported/OLD",
            })}\n${storyLine({ target_full_slug: "imported/NEW" })}\n${storyLine(
                { source_id: 3, source_uuid: "u3", target_space_id: "999" },
            )}\n`,
        });

        await runInspector({
            pair: "source-space:target-space",
            prune: true,
            yes: true,
        });

        expect(ledgerLines()).toContain("PRUNE PLAN");
        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("combined: 3 lines -> 1 kept, 2 removed") &&
                    line.includes("1 recorded for another space pair") &&
                    line.includes(
                        "1 superseded by a later line for the same source",
                    ),
            ),
        ).toBe(true);

        const written = await readFile(combinedPath(), "utf8");

        expect(written).toBe(
            `${storyLine({ target_full_slug: "imported/NEW" })}\n`,
        );

        // Nothing is deleted: the pre-prune file is still on disk.
        const archives = (await readdir(ledgerDir())).filter((name) =>
            name.endsWith(".bak"),
        );

        expect(archives).toHaveLength(1);
        expect(
            await readFile(
                path.join(ledgerDir(), archives[0] as string),
                "utf8",
            ),
        ).toContain("imported/OLD");
    });

    it("plans a prune without writing anything under --dry-run", async () => {
        const before = `${storyLine()}\n${storyLine()}\n`;

        await writeLedger({ combined: before });

        await runInspector({
            pair: "source-space:target-space",
            prune: true,
            dryRun: true,
        });

        expect(ledgerLines()).toContain("PRUNE PLAN");
        expect(await readFile(combinedPath(), "utf8")).toBe(before);
        expect(mocks.askYesNo).not.toHaveBeenCalled();
        expect(
            (await readdir(ledgerDir())).filter((name) =>
                name.endsWith(".bak"),
            ),
        ).toHaveLength(0);
    });

    it("refuses to prune without a terminal and without --yes", async () => {
        const before = `${storyLine()}\n${storyLine()}\n`;

        await writeLedger({ combined: before });

        const isTTY = process.stdin.isTTY;
        Object.defineProperty(process.stdin, "isTTY", {
            value: false,
            configurable: true,
        });

        try {
            await runInspector({
                pair: "source-space:target-space",
                prune: true,
            });
        } finally {
            Object.defineProperty(process.stdin, "isTTY", {
                value: isTTY,
                configurable: true,
            });
        }

        expect(await readFile(combinedPath(), "utf8")).toBe(before);
        expect(process.exitCode).toBe(1);
    });

    it("leaves a healthy ledger alone and says there is nothing to prune", async () => {
        const before = `${storyLine()}\n`;

        await writeLedger({ combined: before });

        await runInspector({
            pair: "source-space:target-space",
            prune: true,
            yes: true,
        });

        expect(ledgerLines()).toContain(
            "  nothing to prune: every line in this ledger is one a run would use.",
        );
        expect(await readFile(combinedPath(), "utf8")).toBe(before);
        expect(mocks.askYesNo).not.toHaveBeenCalled();
    });

    it("makes an unhealthy ledger healthy: prune, then inspect finds nothing", async () => {
        await writeLedger({
            combined: `${storyLine({
                target_full_slug: "imported/OLD",
            })}\n${storyLine({ target_full_slug: "imported/NEW" })}\n`,
        });

        await runInspector({
            pair: "source-space:target-space",
            prune: true,
            yes: true,
        });

        process.exitCode = exitCodeBefore;
        vi.clearAllMocks();

        await runInspector({ pair: "source-space:target-space" });

        // Named explicitly, so a clean bill of health cannot come from having
        // read some other pair's ledger — or nobody's.
        expect(ledgerLines()).toContain("  pair: source-space to target-space");
        expect(ledgerLines()).toContain("  combined: 1 entry");
        expect(
            ledgerLines().some((line) =>
                line.includes("story  blog/post-1 -> imported/NEW"),
            ),
        ).toBe(true);
        expect(ledgerLines()).toContain(
            "  no problems found in the ledger itself.",
        );
        expect(process.exitCode).toBeUndefined();
    });
});
