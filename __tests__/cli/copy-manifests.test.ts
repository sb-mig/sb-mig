import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
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

const runInspector = (flags: Record<string, unknown> = {}) =>
    copyCommand({
        input: ["copy", "manifests"],
        flags: {
            from: "source-space",
            to: "target-space",
            manifestRoot,
            ...flags,
        },
    } as any);

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

        await runInspector();

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
        await runInspector();

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

        await runInspector();

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

        await runInspector();

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

        await runInspector();

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

        await runInspector({ outputPath });

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
});
