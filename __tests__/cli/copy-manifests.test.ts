import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    symlink,
    utimes,
    writeFile,
} from "fs/promises";
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
        source_space_id: "111",
        target_space_id: "222",
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
        source_space_id: "111",
        target_space_id: "222",
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
    const dir = path.join(manifestRoot, "copy", "111", "222");
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

const ledgerDir = () => path.join(manifestRoot, "copy", "111", "222");

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
    runInspector({ from: "111", to: "222", ...flags });

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

        expect(ledgerLines()).toContain("  pair: 111 to 222");
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
            // The three artifacts this command writes share a command name;
            // `mode` is what lets a consumer tell them apart without guessing
            // from which keys happen to be present.
            mode: "pair",
            normalized: {
                sourceSpaceId: "111",
                targetSpaceId: "222",
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
                path.join(manifestRoot, "copy", "111", "222", "manifest.jsonl"),
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
            "333",
            "444",
            `${storyLine({
                source_space_id: "333",
                target_space_id: "444",
            })}\n`,
        );

        await runInspector({});

        expect(ledgerLines()).toContain("LEDGERS");
        expect(ledgerLines()).toContain("  2 pairs:");
        expect(
            ledgerLines().some((line) => line.includes("111 -> 222  1 entry")),
        ).toBe(true);
        expect(
            ledgerLines().some((line) => line.includes("333 -> 444  1 entry")),
        ).toBe(true);
        expect(process.exitCode).toBeUndefined();
    });

    it("names each pair by its absolute path and the ledger's real mtime", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        // The filesystem is the authority on when a file was last touched. A
        // created_at inside the file only says what a run believed it did, and
        // a hand edit does not update it at all.
        const touched = new Date("2026-03-01T12:00:00.000Z");
        await utimes(combinedPath(), touched, touched);

        await runInspector({});

        expect(ledgerLines()).toContain(`      ${path.resolve(ledgerDir())}`);
        expect(ledgerLines()).toContain(
            "      last written 2026-03-01T12:00:00.000Z",
        );
        expect(path.isAbsolute(path.resolve(ledgerDir()))).toBe(true);
    });

    it("says 'never' for a pair directory that holds no combined ledger", async () => {
        await mkdir(path.join(manifestRoot, "copy", "555", "666"), {
            recursive: true,
        });

        await runInspector({});

        expect(ledgerLines()).toContain("      last written never");
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
            flags: { from: "111", manifestRoot },
        } as any);

        expect(errorLines()[0]).toContain("Name the whole pair");
        expect(process.exitCode).toBe(1);
    });

    it("refuses a --pair that is not written as source:target", async () => {
        await runInspector({ pair: "111" });

        expect(errorLines()[0]).toContain(
            "--pair must be written as <sourceSpaceId>:<targetSpaceId>",
        );
        expect(process.exitCode).toBe(1);
    });

    it("refuses --type and --slug without a pair to apply them to", async () => {
        await runInspector({ type: "story" });

        expect(errorLines()[0]).toContain(
            "--type and --slug both act on one ledger",
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

        await runInspector({ pair: "111:222" });

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
            pair: "111:222",
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
            pair: "111:222",
            slug: "post-1",
        });

        expect(
            ledgerLines().some((line) =>
                line.includes("showing 1 matching slug containing 'post-1'"),
            ),
        ).toBe(true);
    });

    it("refuses a --type it does not know", async () => {
        await runInspector({
            pair: "111:222",
            type: "banana",
        });

        expect(errorLines()[0]).toContain(
            "--type must be one of: story, asset, asset_folder",
        );
        expect(process.exitCode).toBe(1);
    });

    /* --------------------------------------------------------------- *
     * The contract: --prune deletes exactly one pair directory
     * --------------------------------------------------------------- */

    it("deletes exactly the named pair directory, behind the gate", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });
        await writePairLedger(
            "333",
            "444",
            `${storyLine({
                source_space_id: "333",
                target_space_id: "444",
            })}\n`,
        );

        await runInspector({ prune: "111:222", yes: true });

        expect(ledgerLines()).toContain("PRUNE PLAN");
        expect(ledgerLines()).toContain(
            `  delete: ${path.resolve(ledgerDir())}`,
        );
        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("manifest.jsonl (") && line.includes("bytes"),
            ),
        ).toBe(true);

        // Exactly that pair directory, and nothing beside it.
        await expect(readdir(ledgerDir())).rejects.toThrow();
        expect(
            await readdir(path.join(manifestRoot, "copy", "333", "444")),
        ).toContain("manifest.jsonl");
        // The now-empty source directory is left standing: "exactly that pair
        // directory" is the contract, and removing its parent would be
        // deleting something nobody named. It lists as no pair at all.
        expect(await readdir(path.join(manifestRoot, "copy", "111"))).toEqual(
            [],
        );
    });

    it("deletes nothing under --dry-run", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({ prune: "111:222", dryRun: true });

        expect(ledgerLines()).toContain("PRUNE PLAN");
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
        expect(mocks.askYesNo).not.toHaveBeenCalled();
    });

    it("refuses to delete without a terminal and without --yes", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        const isTTY = process.stdin.isTTY;
        Object.defineProperty(process.stdin, "isTTY", {
            value: false,
            configurable: true,
        });

        try {
            await runInspector({ prune: "111:222" });
        } finally {
            Object.defineProperty(process.stdin, "isTTY", {
                value: isTTY,
                configurable: true,
            });
        }

        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
        expect(process.exitCode).toBe(1);
    });

    it("asks before deleting, and deletes nothing when the answer is no", async () => {
        mocks.askYesNo.mockResolvedValue(false);
        await writeLedger({ combined: `${storyLine()}\n` });

        const isTTY = process.stdin.isTTY;
        Object.defineProperty(process.stdin, "isTTY", {
            value: true,
            configurable: true,
        });

        try {
            await runInspector({ prune: "111:222" });
        } finally {
            Object.defineProperty(process.stdin, "isTTY", {
                value: isTTY,
                configurable: true,
            });
        }

        expect(mocks.askYesNo).toHaveBeenCalled();
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
    });

    it("says there is nothing to prune for a pair with no ledger directory", async () => {
        await runInspector({ prune: "777:888", yes: true });

        expect(ledgerLines()).toContain(
            "  nothing to prune: there is no ledger directory for this pair.",
        );
        expect(mocks.askYesNo).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    });

    /* --------------------------------------------------------------- *
     * A space id is a path segment, and it comes from the command line
     * --------------------------------------------------------------- */

    it("refuses a pair id that is not a plain number, before touching the disk", async () => {
        // `../../outside` resolves clean out of the ledger root. Joined into a
        // path by --prune it would delete whatever it landed on.
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({ prune: "../../outside:target" });

        expect(errorLines()[0]).toContain(
            "--prune source space id must be a plain number, not '../../outside'",
        );
        expect(process.exitCode).toBe(1);
        // Nothing was read, nothing was deleted.
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
        expect(ledgerLines()).toEqual([]);
    });

    it("refuses a traversing pair id on the read paths too", async () => {
        await runInspector({ pair: "../../outside:222" });

        expect(errorLines()[0]).toContain(
            "--pair source space id must be a plain number",
        );
        expect(process.exitCode).toBe(1);

        vi.clearAllMocks();
        process.exitCode = exitCodeBefore;

        await copyCommand({
            input: ["copy", "manifests"],
            flags: { from: "111", to: "../outside", manifestRoot },
        } as any);

        expect(errorLines()[0]).toContain(
            "--to target space id must be a plain number",
        );
        expect(process.exitCode).toBe(1);
    });

    it("refuses --prune together with a second way of naming the pair", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({ prune: "111:222", pair: "333:444" });

        expect(errorLines()[0]).toContain("--prune already names the pair");
        expect(process.exitCode).toBe(1);
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
    });

    it("refuses --prune narrowed by a filter", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({ prune: "111:222", type: "story" });

        expect(errorLines()[0]).toContain(
            "--prune deletes a pair's whole ledger directory",
        );
        expect(process.exitCode).toBe(1);
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
    });

    /* --------------------------------------------------------------- *
     * Containment has to hold against the filesystem, not the string
     * --------------------------------------------------------------- */

    it("refuses to prune through a symlinked pair component, leaving the outside directory intact", async () => {
        // `copy/123` points somewhere else entirely. path.resolve collapses the
        // string and never learns that; a recursive delete on
        // copy/123/456 would land on the outside directory's contents.
        const outside = path.join(tempDir, "outside");
        await mkdir(path.join(outside, "456"), { recursive: true });
        await writeFile(path.join(outside, "456", "precious.txt"), "keep me");

        await mkdir(path.join(manifestRoot, "copy"), { recursive: true });
        await symlink(outside, path.join(manifestRoot, "copy", "123"), "dir");

        await runInspector({ prune: "123:456", yes: true });

        expect(errorLines()[0]).toContain("is a symbolic link");
        expect(process.exitCode).toBe(1);

        // The whole point: nothing outside the root was touched.
        expect(
            await readFile(path.join(outside, "456", "precious.txt"), "utf8"),
        ).toBe("keep me");
        expect(await readdir(outside)).toEqual(["456"]);
        // And no plan was printed, because it never got that far.
        expect(ledgerLines()).toEqual([]);
    });

    it("refuses to read a pair through a symlinked component too", async () => {
        const outside = path.join(tempDir, "outside-read");
        await mkdir(path.join(outside, "456"), { recursive: true });

        await mkdir(path.join(manifestRoot, "copy"), { recursive: true });
        await symlink(outside, path.join(manifestRoot, "copy", "123"), "dir");

        await runInspector({ pair: "123:456" });

        expect(errorLines()[0]).toContain("is a symbolic link");
        expect(process.exitCode).toBe(1);
    });

    /* --------------------------------------------------------------- *
     * The plan must disclose everything the delete removes
     * --------------------------------------------------------------- */

    it("lists nested content and symlinks the delete would take", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });
        await mkdir(path.join(ledgerDir(), "sub"), { recursive: true });
        await writeFile(path.join(ledgerDir(), "sub", "secret.txt"), "oh no");
        await symlink(
            path.join(tempDir, "elsewhere"),
            path.join(ledgerDir(), "pointer"),
            "dir",
        );

        await runInspector({ prune: "111:222", dryRun: true });

        // Every entry named, at any depth, with the ones this command never
        // wrote called out: a recursive delete takes them all.
        expect(
            ledgerLines().some((line) => line.includes("file  manifest.jsonl")),
        ).toBe(true);
        expect(ledgerLines().some((line) => line.includes("dir  sub"))).toBe(
            true,
        );
        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("file  sub/secret.txt") &&
                    line.includes("NOT WRITTEN BY copy manifests"),
            ),
        ).toBe(true);
        expect(
            ledgerLines().some(
                (line) =>
                    line.includes("symlink  pointer") &&
                    line.includes(path.join(tempDir, "elsewhere")),
            ),
        ).toBe(true);
        expect(
            ledgerLines().some((line) =>
                line.includes(
                    "3 of these entries were not written by copy manifests",
                ),
            ),
        ).toBe(true);
    });

    it("counts the known ledger files as expected content", async () => {
        await writeLedger({
            combined: `${storyLine()}\n`,
            stories: `${storyLine()}\n`,
        });

        await runInspector({ prune: "111:222", dryRun: true });

        expect(
            ledgerLines().some((line) =>
                line.includes("not written by copy manifests"),
            ),
        ).toBe(false);
        expect(
            ledgerLines().some((line) =>
                line.includes("2 files, 0 directories, 0 symlinks"),
            ),
        ).toBe(true);
    });

    /* --------------------------------------------------------------- *
     * A report inside the deletion target
     * --------------------------------------------------------------- */

    it("refuses an --outputPath inside the directory it is about to delete", async () => {
        await writeLedger({ combined: `${storyLine()}\n` });

        await runInspector({
            prune: "111:222",
            yes: true,
            outputPath: path.join(ledgerDir(), "report.json"),
        });

        expect(errorLines()[0]).toContain(
            "is inside the directory --prune deletes",
        );
        expect(process.exitCode).toBe(1);
        // Refused before anything was deleted.
        expect(await readdir(ledgerDir())).toContain("manifest.jsonl");
    });

    it("writes the prune report to a path outside the deletion target", async () => {
        const outputPath = path.join(tempDir, "reports", "prune.json");

        await writeLedger({ combined: `${storyLine()}\n` });
        await mkdir(path.join(ledgerDir(), "sub"), { recursive: true });
        await writeFile(path.join(ledgerDir(), "sub", "secret.txt"), "oh no");

        await runInspector({ prune: "111:222", yes: true, outputPath });

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report).toMatchObject({
            command: "copy manifests --prune",
            mode: "prune",
            normalized: { sourceSpaceId: "111", targetSpaceId: "222" },
        });
        expect(report.entries.map((entry: any) => entry.path).sort()).toEqual([
            "manifest.jsonl",
            "sub",
            "sub/secret.txt",
        ]);
        expect(report.summary.unexpected).toBe(2);
        // The report survived the delete it describes.
        await expect(readdir(ledgerDir())).rejects.toThrow();
    });
});
