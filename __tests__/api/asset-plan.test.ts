import { describe, expect, it } from "vitest";

import {
    countAssetCopyPlan,
    createAssetCopyDecider,
    formatAssetCopyPlanLine,
    planAssetCopy,
} from "../../src/api/copy/asset-plan.js";

const url = (space: string, dims: string, hash: string, name: string) =>
    `https://a.storyblok.com/f/${space}/${dims}/${hash}/${name}`;

const assetLine = (
    sourceId: number,
    targetId: number,
    action = "created",
) =>
    ({
        type: "asset",
        source_space_id: "1",
        target_space_id: "2",
        source_id: sourceId,
        target_id: targetId,
        source_filename: "",
        target_filename: "",
        action,
        created_at: "2026-09-23T00:00:00.000Z",
    }) as const;

const folderLine = (sourceId: number, targetId: number) =>
    ({
        type: "asset_folder",
        source_space_id: "1",
        target_space_id: "2",
        source_id: sourceId,
        target_id: targetId,
        action: "created",
        created_at: "2026-09-23T00:00:00.000Z",
    }) as const;

const decider = ({
    ledger = [] as any[],
    targetFolders = [] as any[],
    targetAssets = [] as any[],
    paths = new Map<string, number>(),
} = {}) =>
    createAssetCopyDecider({
        ledgerEntries: ledger,
        targetFolders,
        targetAssets,
        targetFolderIdByPath: paths,
    });

describe("the copy assets decision (MAR-3359)", () => {
    // Order canary. Mutation that must turn it red: look for the file name
    // before the ledger.
    it("asks the ledger before the target library", () => {
        const name = url("1", "10x10", "aaaaaaaa", "same.jpg");
        const decide = decider({
            ledger: [assetLine(5, 50)],
            targetAssets: [
                { id: 50, filename: url("2", "10x10", "cccccccc", "x.jpg") },
                // A unique same-named file that is NOT the ledger's copy.
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "same.jpg") },
            ],
        });

        expect(
            decide.decideAsset({ sourceId: 5, sourceFilename: name }),
        ).toEqual({ action: "match", via: "ledger", targetId: 50 });
    });

    it("matches a unique file name the ledger does not know", () => {
        const decide = decider({
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
            ],
        });

        expect(
            decide.decideAsset({
                sourceId: 6,
                sourceFilename: url("1", "10x10", "aaaaaaaa", "one.jpg"),
            }),
        ).toEqual({ action: "match", via: "target_key", targetId: 60 });
    });

    it("never matches a file name the target holds twice", () => {
        const decide = decider({
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
                { id: 61, filename: url("2", "10x10", "cccccccc", "one.jpg") },
            ],
        });

        expect(
            decide.decideAsset({
                sourceId: 6,
                sourceFilename: url("1", "10x10", "aaaaaaaa", "one.jpg"),
            }),
        ).toEqual({ action: "create" });
    });

    it("leaves a claimed copy out, so the other same-named file is the match", () => {
        const decide = decider({
            ledger: [assetLine(1, 60)],
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
                { id: 61, filename: url("2", "10x10", "cccccccc", "one.jpg") },
            ],
        });

        expect(
            decide.decideAsset({
                sourceId: 2,
                sourceFilename: url("1", "10x10", "aaaaaaaa", "one.jpg"),
            }),
        ).toEqual({ action: "match", via: "target_key", targetId: 61 });
    });

    it("sees a claim made earlier in the same run", () => {
        const name = url("1", "10x10", "aaaaaaaa", "one.jpg");
        const decide = decider({
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
            ],
        });
        const plan = planAssetCopy({
            decider: decide,
            folders: [],
            assets: [
                { sourceId: 1, sourceFilename: name },
                // Same name, same size, another source: the first one took it.
                { sourceId: 2, sourceFilename: name },
            ],
        });

        expect(plan.assets).toEqual([
            { sourceId: 1, action: "match", via: "target_key", targetId: 60 },
            { sourceId: 2, action: "create" },
        ]);
    });

    it("forgets a superseded line: a remapped source claims only its new copy", () => {
        const decide = decider({
            ledger: [assetLine(1, 60), assetLine(1, 70)],
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
                { id: 70, filename: url("2", "10x10", "cccccccc", "two.jpg") },
            ],
        });

        expect(
            decide.decideAsset({
                sourceId: 2,
                sourceFilename: url("1", "10x10", "aaaaaaaa", "one.jpg"),
            }),
        ).toEqual({ action: "match", via: "target_key", targetId: 60 });
    });

    it("keeps a created line even when another source matched onto it", () => {
        const decide = decider({
            ledger: [assetLine(1, 60), assetLine(2, 60, "matched_by_target_key")],
            targetAssets: [
                { id: 60, filename: url("2", "10x10", "bbbbbbbb", "one.jpg") },
            ],
        });

        // The source that made the copy keeps it; the one that matched onto
        // it is the stale one.
        expect(
            decide.decideAsset({ sourceId: 1, sourceFilename: "" }),
        ).toEqual({ action: "match", via: "ledger", targetId: 60 });
        expect(
            decide.decideAsset({ sourceId: 2, sourceFilename: "" }),
        ).toEqual({
            action: "create",
            via: "stale_ledger",
            staleReason: "claimed_by_another_source",
        });
    });

    it("recreates a folder the target lost, and matches one it holds by path", () => {
        const decide = decider({
            ledger: [folderLine(10, 110)],
            targetFolders: [{ id: 120 }],
            paths: new Map([["Root/Nested", 120]]),
        });

        expect(decide.decideFolder({ sourceId: 10, sourcePath: "Root" })).toEqual(
            {
                action: "create",
                via: "stale_ledger",
                staleReason: "deleted_in_target",
            },
        );
        expect(
            decide.decideFolder({
                sourceId: 20,
                sourcePath: "Root/Nested",
                sourceParentId: 10,
            }),
        ).toEqual({ action: "match", via: "target_key", targetId: 120 });
    });

    it("creates nothing inside a folder that could not be made", () => {
        const decide = decider();

        decide.markFolderUnavailable(10);

        expect(
            decide.decideFolder({ sourceId: 20, sourceParentId: 10 }),
        ).toEqual({ action: "skip" });
        // The skipped folder is unavailable in turn.
        expect(
            decide.decideAsset({
                sourceId: 1,
                sourceFilename: url("1", "10x10", "aaaaaaaa", "one.jpg"),
                sourceAssetFolderId: 20,
            }),
        ).toEqual({ action: "skip" });
    });

    it("reads a folder the run just made as present", () => {
        const decide = decider({ ledger: [folderLine(10, 110)] });

        decide.recordFolder({ sourceId: 10, targetId: 110 });

        expect(decide.decideFolder({ sourceId: 10 })).toEqual({
            action: "match",
            via: "ledger",
            targetId: 110,
        });
    });

    it("counts the plan so the numbers add up, and names skips only when there are some", () => {
        const counts = countAssetCopyPlan({
            folders: [
                { sourceId: 1, action: "match", via: "ledger", targetId: 1 },
                { sourceId: 2, action: "create" },
            ],
            assets: [
                { sourceId: 3, action: "match", via: "ledger", targetId: 3 },
                { sourceId: 4, action: "match", via: "target_key", targetId: 4 },
                { sourceId: 5, action: "create" },
                {
                    sourceId: 6,
                    action: "create",
                    via: "stale_ledger",
                    staleReason: "deleted_in_target",
                },
            ],
        });

        expect(formatAssetCopyPlanLine(counts)).toBe(
            "assets: 1 already copied (ledger), 1 found in target, 1 will upload, 1 stale in ledger (will upload again); folders: 1 already copied, 0 found in target, 1 will create",
        );
        expect(
            formatAssetCopyPlanLine({ ...counts, assetsSkipped: 2 }),
        ).toContain("(will upload again), 2 skipped;");
    });
});
