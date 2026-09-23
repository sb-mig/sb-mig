import type { CopyManifestEntry } from "./types.js";

import { normalizeAssetFolderParentId } from "./assets.js";
import { assetKeyOf } from "./reference-scanner.js";

/**
 * What a `copy assets` run does with one folder or one asset — decided in ONE
 * place, so the dry-run and the apply can never disagree.
 *
 * - folder: ledger → target folder path → create (skipped when the parent is
 *   unavailable)
 * - asset: ledger → unique target file name → create (skipped when its folder
 *   is unavailable)
 *
 * A ledger mapping is trusted only while the target still holds what it
 * points at, and only while no other source claims the same target (see
 * `stale_ledger`). A stale mapping is created again, and the new ledger line
 * supersedes the old one: the ledger maps keep the last line.
 */
export type AssetPlanAction = "match" | "create" | "skip";

export type AssetPlanVia = "ledger" | "target_key" | "stale_ledger";

export type AssetPlanStaleReason =
    | "deleted_in_target"
    | "claimed_by_another_source";

export type AssetPlanDecision = {
    action: AssetPlanAction;
    via?: AssetPlanVia;
    /** The target folder or asset a `match` resolves to. */
    targetId?: number;
    /** Why a ledger mapping is not trusted, when `via` is `stale_ledger`. */
    staleReason?: AssetPlanStaleReason;
};

type TargetFolder = { id: number | string };

type TargetAsset = { id: number | string; filename?: string };

/** `getFileName`'s reading, without its throw on an empty value. */
const fileNameOf = (filename: string | undefined): string =>
    String(filename ?? "")
        .split("/")
        .pop() ?? "";

const dimensionsOf = (filename: string | undefined): string | undefined =>
    assetKeyOf(filename)?.dimensions || undefined;

/**
 * The decider for one run. It is built from what the run knows before its
 * first write — the ledger entries and the two target listings — and is told
 * of every mapping the run appends afterwards through `recordFolder` and
 * `recordAsset`, so a later decision sees every claim made earlier in the same
 * run. No I/O: the caller does the reading and the writing.
 */
export const createAssetCopyDecider = ({
    ledgerEntries,
    targetFolders,
    targetAssets,
    targetFolderIdByPath,
}: {
    ledgerEntries: CopyManifestEntry[];
    targetFolders: TargetFolder[];
    targetAssets: TargetAsset[];
    /** Target folder ids by their full path, as the apply builds them. */
    targetFolderIdByPath: Map<string, number>;
}) => {
    const presentFolderIds = new Set(
        targetFolders.map((folder) => Number(folder.id)),
    );
    const presentAssetIds = new Set(
        targetAssets.map((asset) => Number(asset.id)),
    );
    // Last line wins, exactly as `buildCopyMaps` reads the ledger.
    const folderTargetBySource = new Map<number, number>();
    const assetTargetBySource = new Map<number, number>();
    const assetActionBySource = new Map<number, string>();
    // The reverse of `assetTargetBySource`: which sources the ledger maps
    // onto each target asset right now. A remapped source leaves its old
    // target, so a superseded line claims nothing.
    const sourcesByTarget = new Map<number, Set<number>>();

    const setAssetMapping = (
        sourceId: number,
        targetId: number,
        action: string,
    ) => {
        const previous = assetTargetBySource.get(sourceId);

        if (previous !== undefined) {
            sourcesByTarget.get(previous)?.delete(sourceId);
        }

        assetTargetBySource.set(sourceId, targetId);
        assetActionBySource.set(sourceId, action);

        const sources = sourcesByTarget.get(targetId) ?? new Set<number>();

        sources.add(sourceId);
        sourcesByTarget.set(targetId, sources);
    };

    for (const entry of ledgerEntries) {
        if (entry.type === "asset_folder") {
            folderTargetBySource.set(
                Number(entry.source_id),
                Number(entry.target_id),
            );
        }

        if (entry.type === "asset") {
            setAssetMapping(
                Number(entry.source_id),
                Number(entry.target_id),
                entry.action,
            );
        }
    }

    const isClaimedByAnotherSource = (targetId: number, sourceId: number) =>
        [...(sourcesByTarget.get(targetId) ?? [])].some(
            (other) => other !== sourceId,
        );

    // One pass over the listing, not one per source asset: Hult's library is
    // 4,731 files, and a scan per asset would be twenty million comparisons.
    const targetsByFileName = new Map<string, TargetAsset[]>();

    for (const asset of targetAssets) {
        const name = fileNameOf(asset.filename);
        const bucket = targetsByFileName.get(name) ?? [];

        bucket.push(asset);
        targetsByFileName.set(name, bucket);
    }

    const unavailableFolderIds = new Set<number>();

    const isFolderUnavailable = (folderId: number | null | undefined) =>
        folderId !== null &&
        folderId !== undefined &&
        unavailableFolderIds.has(Number(folderId));

    const decideFolder = ({
        sourceId,
        sourcePath,
        sourceParentId,
    }: {
        sourceId: number;
        sourcePath?: string;
        sourceParentId?: number | null;
    }): AssetPlanDecision => {
        const parentId = normalizeAssetFolderParentId(sourceParentId);
        const mappedTargetId = folderTargetBySource.get(sourceId);
        const createOrSkip = (
            decision: AssetPlanDecision,
        ): AssetPlanDecision => {
            if (isFolderUnavailable(parentId)) {
                unavailableFolderIds.add(sourceId);
                return { action: "skip" };
            }

            return decision;
        };

        if (mappedTargetId !== undefined) {
            if (presentFolderIds.has(mappedTargetId)) {
                return {
                    action: "match",
                    via: "ledger",
                    targetId: mappedTargetId,
                };
            }

            return createOrSkip({
                action: "create",
                via: "stale_ledger",
                staleReason: "deleted_in_target",
            });
        }

        const pathTargetId = sourcePath
            ? targetFolderIdByPath.get(sourcePath)
            : undefined;

        if (pathTargetId !== undefined) {
            return {
                action: "match",
                via: "target_key",
                targetId: pathTargetId,
            };
        }

        return createOrSkip({ action: "create" });
    };

    /**
     * The single target asset a source may be matched to by file name, or
     * none. A target another source's mapping already claims is never a
     * candidate (it is that source's copy), and a candidate cropped to other
     * dimensions is a different file with the same name.
     */
    const findTargetByFileName = ({
        sourceId,
        sourceFilename,
    }: {
        sourceId: number;
        sourceFilename: string;
    }): TargetAsset | undefined => {
        const candidates = (
            targetsByFileName.get(fileNameOf(sourceFilename)) ?? []
        ).filter(
            (asset) => !isClaimedByAnotherSource(Number(asset.id), sourceId),
        );

        if (candidates.length !== 1) {
            return undefined;
        }

        const candidate = candidates[0]!;
        const sourceDimensions = dimensionsOf(sourceFilename);
        const targetDimensions = dimensionsOf(candidate.filename);

        if (
            sourceDimensions &&
            targetDimensions &&
            sourceDimensions !== targetDimensions
        ) {
            return undefined;
        }

        return candidate;
    };

    const decideAsset = ({
        sourceId,
        sourceFilename,
        sourceAssetFolderId,
    }: {
        sourceId: number;
        sourceFilename: string;
        sourceAssetFolderId?: number | null;
    }): AssetPlanDecision => {
        const createOrSkip = (
            decision: AssetPlanDecision,
        ): AssetPlanDecision =>
            isFolderUnavailable(sourceAssetFolderId)
                ? { action: "skip" }
                : decision;
        const mappedTargetId = assetTargetBySource.get(sourceId);

        if (mappedTargetId !== undefined) {
            if (!presentAssetIds.has(mappedTargetId)) {
                return createOrSkip({
                    action: "create",
                    via: "stale_ledger",
                    staleReason: "deleted_in_target",
                });
            }

            // A file-name match that landed on another source's copy is the
            // defect this heals: the rerun uploads the file it never copied.
            if (
                assetActionBySource.get(sourceId) === "matched_by_target_key" &&
                isClaimedByAnotherSource(mappedTargetId, sourceId)
            ) {
                return createOrSkip({
                    action: "create",
                    via: "stale_ledger",
                    staleReason: "claimed_by_another_source",
                });
            }

            return { action: "match", via: "ledger", targetId: mappedTargetId };
        }

        const byFileName = findTargetByFileName({ sourceId, sourceFilename });

        if (byFileName) {
            return {
                action: "match",
                via: "target_key",
                targetId: Number(byFileName.id),
            };
        }

        return createOrSkip({ action: "create" });
    };

    return {
        decideFolder,
        decideAsset,
        /** A folder mapping the run just wrote, or a folder it just made. */
        recordFolder: ({
            sourceId,
            targetId,
        }: {
            sourceId: number;
            targetId: number;
        }) => {
            folderTargetBySource.set(sourceId, targetId);
            presentFolderIds.add(targetId);
        },
        /** An asset mapping the run just wrote; `action` is its ledger action. */
        recordAsset: ({
            sourceId,
            targetId,
            action,
        }: {
            sourceId: number;
            targetId: number;
            action: string;
        }) => {
            setAssetMapping(sourceId, targetId, action);
            presentAssetIds.add(targetId);
        },
        /** A folder the run could not make: nothing is created inside it. */
        markFolderUnavailable: (sourceId: number) => {
            unavailableFolderIds.add(sourceId);
        },
    };
};

export type AssetCopyDecider = ReturnType<typeof createAssetCopyDecider>;

export type AssetCopyPlanItem = AssetPlanDecision & {
    sourceId: number;
};

export type AssetCopyPlan = {
    folders: AssetCopyPlanItem[];
    assets: AssetCopyPlanItem[];
};

/**
 * The whole run, decided ahead of time for a dry-run: the same decider the
 * apply asks item by item, walked in the apply's own order. A planned create
 * cannot fail here, so its folder stays available; a planned file-name match
 * is recorded as the claim the apply would write.
 */
export const planAssetCopy = ({
    decider,
    folders,
    assets,
}: {
    decider: AssetCopyDecider;
    folders: Array<{
        sourceId: number;
        sourcePath?: string;
        sourceParentId?: number | null;
    }>;
    assets: Array<{
        sourceId: number;
        sourceFilename: string;
        sourceAssetFolderId?: number | null;
    }>;
}): AssetCopyPlan => {
    const plannedFolders = folders.map((folder) => ({
        sourceId: folder.sourceId,
        ...decider.decideFolder(folder),
    }));
    const plannedAssets = assets.map((asset) => {
        const decision = decider.decideAsset(asset);

        // The claim the apply would append: a later source with the same
        // file name must not land on it.
        if (
            decision.action === "match" &&
            decision.via === "target_key" &&
            decision.targetId !== undefined
        ) {
            decider.recordAsset({
                sourceId: asset.sourceId,
                targetId: decision.targetId,
                action: "matched_by_target_key",
            });
        }

        return { sourceId: asset.sourceId, ...decision };
    });

    return { folders: plannedFolders, assets: plannedAssets };
};

/** The seven numbers a person reads before any per-item line. */
export type AssetCopyPlanCounts = {
    assetsAlreadyCopied: number;
    assetsFoundInTarget: number;
    assetsToUpload: number;
    assetsStaleInLedger: number;
    assetsSkipped: number;
    foldersAlreadyCopied: number;
    foldersFoundInTarget: number;
    foldersToCreate: number;
    foldersSkipped: number;
};

export const countAssetCopyPlan = (
    plan: AssetCopyPlan,
): AssetCopyPlanCounts => {
    const count = (
        items: AssetCopyPlanItem[],
        test: (item: AssetCopyPlanItem) => boolean,
    ) => items.filter(test).length;

    return {
        assetsAlreadyCopied: count(
            plan.assets,
            (item) => item.action === "match" && item.via === "ledger",
        ),
        assetsFoundInTarget: count(
            plan.assets,
            (item) => item.action === "match" && item.via === "target_key",
        ),
        assetsToUpload: count(
            plan.assets,
            (item) => item.action === "create" && item.via !== "stale_ledger",
        ),
        assetsStaleInLedger: count(
            plan.assets,
            (item) => item.action === "create" && item.via === "stale_ledger",
        ),
        assetsSkipped: count(plan.assets, (item) => item.action === "skip"),
        foldersAlreadyCopied: count(
            plan.folders,
            (item) => item.action === "match" && item.via === "ledger",
        ),
        foldersFoundInTarget: count(
            plan.folders,
            (item) => item.action === "match" && item.via === "target_key",
        ),
        foldersToCreate: count(
            plan.folders,
            (item) => item.action === "create",
        ),
        foldersSkipped: count(plan.folders, (item) => item.action === "skip"),
    };
};

/**
 * `assets: 2 already copied (ledger), 1 found in target, 2 will upload,
 * 1 stale in ledger (will upload again); folders: 1 already copied, 1 found in
 * target, 0 will create` — skips are named only when there are some, so the
 * numbers always add up to what was selected.
 */
export const formatAssetCopyPlanLine = (
    counts: AssetCopyPlanCounts,
): string => {
    const assets = [
        `${counts.assetsAlreadyCopied} already copied (ledger)`,
        `${counts.assetsFoundInTarget} found in target`,
        `${counts.assetsToUpload} will upload`,
        `${counts.assetsStaleInLedger} stale in ledger (will upload again)`,
        ...(counts.assetsSkipped > 0
            ? [`${counts.assetsSkipped} skipped`]
            : []),
    ];
    const folders = [
        `${counts.foldersAlreadyCopied} already copied`,
        `${counts.foldersFoundInTarget} found in target`,
        `${counts.foldersToCreate} will create`,
        ...(counts.foldersSkipped > 0
            ? [`${counts.foldersSkipped} skipped`]
            : []),
    ];

    return `assets: ${assets.join(", ")}; folders: ${folders.join(", ")}`;
};

/** How a stale item's line says why. */
export const describeStaleReason = (
    reason: AssetPlanStaleReason | undefined,
): string =>
    reason === "claimed_by_another_source"
        ? "claimed by another source"
        : "deleted in target";
