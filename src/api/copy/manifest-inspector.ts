import type {
    CopyAction,
    CopyManifestEntry,
    CopyResourceType,
    CopyStoryManifestEntry,
} from "./types.js";

/**
 * The four files of one copy pair's ledger. `combined` is the authority: every
 * copy run builds its maps from that file alone, so anything recorded only in a
 * per-resource file is invisible to the runs it was written for.
 */
export type CopyManifestFileKind =
    | "combined"
    | "stories"
    | "assets"
    | "assetFolders";

export type CopyManifestFileInput = {
    kind: CopyManifestFileKind;
    path: string;
    exists: boolean;
    /** Parsed entries, absent when the file is missing or would not parse. */
    entries?: CopyManifestEntry[];
    /** Why the file could not be read, when it exists but did not parse. */
    error?: string;
};

export type CopyManifestFileReport = {
    kind: CopyManifestFileKind;
    path: string;
    exists: boolean;
    entries: number;
    error?: string;
};

export type CopyManifestFindingCode =
    | "unreadable_file"
    | "conflicting_mapping"
    | "duplicate_mapping"
    | "missing_target_full_slug"
    | "space_pair_mismatch"
    | "missing_from_combined";

export type CopyManifestFinding = {
    code: CopyManifestFindingCode;
    /**
     * `error` means a run reading this ledger would do the wrong thing;
     * `warning` means it costs the run something it could otherwise have had.
     */
    severity: "error" | "warning";
    message: string;
    resource?: CopyResourceType;
    /** The mapping key the finding is about, in the run's own vocabulary. */
    key?: string;
    file?: CopyManifestFileKind;
};

export type CopyManifestInspection = {
    schemaVersion: 1;
    command: "copy manifests";
    generatedAt: string;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        rootDir: string;
    };
    files: CopyManifestFileReport[];
    summary: {
        entries: number;
        stories: number;
        assets: number;
        assetFolders: number;
        byAction: Partial<Record<CopyAction, number>>;
        /** Distinct identities the ledger maps, counted per runtime map. */
        mappingKeys: number;
        conflicts: number;
        duplicates: number;
        storiesWithoutTargetPath: number;
        errors: number;
        warnings: number;
    };
    findings: CopyManifestFinding[];
};

const isStoryEntry = (
    entry: CopyManifestEntry,
): entry is CopyStoryManifestEntry => entry.type === "story";

/**
 * Every identity a ledger entry claims, in the exact terms `buildCopyMaps`
 * keys its maps on. A story writes two mappings, not one — the numeric id and
 * the uuid live in separate maps and can disagree with each other — so a
 * conflict has to be reported against the map that would actually be poisoned.
 */
const getEntryMappings = (
    entry: CopyManifestEntry,
): { key: string; value: string }[] => {
    if (isStoryEntry(entry)) {
        return [
            {
                key: `story id ${entry.source_id}`,
                value: String(entry.target_id),
            },
            {
                key: `story uuid ${entry.source_uuid}`,
                value: String(entry.target_uuid),
            },
        ];
    }

    if (entry.type === "asset") {
        return [
            {
                key: `asset id ${entry.source_id}`,
                value: `${entry.target_id}:${entry.target_filename}`,
            },
        ];
    }

    return [
        {
            key: `asset folder id ${entry.source_id}`,
            value: String(entry.target_id),
        },
    ];
};

/**
 * Reads a copy pair's ledger back and says whether a run could trust it.
 *
 * Pure on purpose: the caller does the file reading, so the same accounting
 * can be exercised over fixtures without a disk. It answers only what the
 * files themselves prove — whether the target space still holds the stories
 * these mappings name is a question for the space, not for this function.
 */
export const inspectCopyManifests = ({
    sourceSpaceId,
    targetSpaceId,
    rootDir,
    files,
    generatedAt = new Date().toISOString(),
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir: string;
    files: CopyManifestFileInput[];
    generatedAt?: string;
}): CopyManifestInspection => {
    const findings: CopyManifestFinding[] = [];

    for (const file of files) {
        if (file.error) {
            findings.push({
                code: "unreadable_file",
                severity: "error",
                message: `Ledger file '${file.path}' could not be read: ${file.error}`,
                file: file.kind,
            });
        }
    }

    const combined =
        files.find((file) => file.kind === "combined")?.entries ?? [];
    const byAction: Partial<Record<CopyAction, number>> = {};
    const targetsByKey = new Map<
        string,
        { resource: CopyResourceType; values: string[] }
    >();
    let storiesWithoutTargetPath = 0;

    for (const entry of combined) {
        byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;

        if (
            entry.source_space_id !== sourceSpaceId ||
            entry.target_space_id !== targetSpaceId
        ) {
            findings.push({
                code: "space_pair_mismatch",
                severity: "error",
                message: `A ${entry.type} entry records the pair ${entry.source_space_id} to ${entry.target_space_id}, but this ledger belongs to ${sourceSpaceId} to ${targetSpaceId}. A run would rewrite content using a mapping made for another pair.`,
                resource: entry.type,
                file: "combined",
            });
        }

        if (isStoryEntry(entry) && !entry.target_full_slug) {
            storiesWithoutTargetPath += 1;
        }

        for (const mapping of getEntryMappings(entry)) {
            const existing = targetsByKey.get(mapping.key);

            if (existing) {
                existing.values.push(mapping.value);
                continue;
            }

            targetsByKey.set(mapping.key, {
                resource: entry.type,
                values: [mapping.value],
            });
        }
    }

    let conflicts = 0;
    let duplicates = 0;

    for (const [key, { resource, values }] of targetsByKey) {
        if (values.length < 2) {
            continue;
        }

        const distinct = [...new Set(values)];

        if (distinct.length > 1) {
            conflicts += 1;
            findings.push({
                code: "conflicting_mapping",
                severity: "error",
                message: `${key} maps to ${distinct.join(" and ")}. A run keeps the last line it reads, so it would use ${values[values.length - 1]} and silently ignore the rest.`,
                resource,
                key,
                file: "combined",
            });
            continue;
        }

        duplicates += 1;
        findings.push({
            code: "duplicate_mapping",
            severity: "warning",
            message: `${key} is recorded ${values.length} times with the same target. Harmless, and cleared the next time this ledger is deduplicated.`,
            resource,
            key,
            file: "combined",
        });
    }

    if (storiesWithoutTargetPath > 0) {
        findings.push({
            code: "missing_target_full_slug",
            severity: "warning",
            message: `${storiesWithoutTargetPath} story mapping(s) carry no target path. Their ids and uuids still relink, but stored link paths such as cached_url cannot be repaired from them; a copy relink over those stories fills the paths in.`,
            resource: "story",
            file: "combined",
        });
    }

    // A per-resource file is a record; the combined file is what a run obeys.
    // An entry present only in the record is a mapping nobody will ever use.
    for (const file of files) {
        if (file.kind === "combined" || !file.entries) {
            continue;
        }

        const missing = new Set<string>();

        for (const entry of file.entries) {
            for (const mapping of getEntryMappings(entry)) {
                if (!targetsByKey.has(mapping.key)) {
                    missing.add(mapping.key);
                }
            }
        }

        for (const key of missing) {
            findings.push({
                code: "missing_from_combined",
                severity: "error",
                message: `${key} is recorded in ${file.path} but not in the combined ledger, which is the only file a copy run reads. This mapping cannot be reused.`,
                key,
                file: file.kind,
            });
        }
    }

    const countType = (type: CopyResourceType) =>
        combined.filter((entry) => entry.type === type).length;

    return {
        schemaVersion: 1,
        command: "copy manifests",
        generatedAt,
        normalized: { sourceSpaceId, targetSpaceId, rootDir },
        files: files.map(({ kind, path, exists, entries, error }) => ({
            kind,
            path,
            exists,
            entries: entries?.length ?? 0,
            ...(error ? { error } : {}),
        })),
        summary: {
            entries: combined.length,
            stories: countType("story"),
            assets: countType("asset"),
            assetFolders: countType("asset_folder"),
            byAction,
            mappingKeys: targetsByKey.size,
            conflicts,
            duplicates,
            storiesWithoutTargetPath,
            errors: findings.filter((finding) => finding.severity === "error")
                .length,
            warnings: findings.filter(
                (finding) => finding.severity === "warning",
            ).length,
        },
        findings,
    };
};

const FINDING_LIST_LIMIT = 20;

const FILE_LABELS: Record<CopyManifestFileKind, string> = {
    combined: "combined",
    stories: "stories",
    assets: "assets",
    assetFolders: "asset folders",
};

/**
 * The ledger read out loud, in the same vocabulary the PLAN block uses so the
 * two can be read side by side.
 */
export const formatCopyManifestInspection = (
    inspection: CopyManifestInspection,
): string[] => {
    const { normalized, summary, files, findings } = inspection;
    const lines = [
        "LEDGER",
        `  pair: ${normalized.sourceSpaceId} to ${normalized.targetSpaceId}`,
        `  root: ${normalized.rootDir}`,
    ];

    for (const file of files) {
        const label = FILE_LABELS[file.kind];

        if (file.error) {
            lines.push(`  ${label}: unreadable`);
            continue;
        }

        lines.push(
            file.exists
                ? `  ${label}: ${file.entries} entr${file.entries === 1 ? "y" : "ies"}`
                : `  ${label}: not written yet`,
        );
    }

    if (summary.entries === 0) {
        lines.push(
            "  nothing has been copied between these spaces yet, or the ledger was moved aside.",
        );
    } else {
        lines.push(
            `  mappings: ${summary.stories} story, ${summary.assets} asset, ${summary.assetFolders} asset folder`,
        );

        const actions = Object.entries(summary.byAction)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([action, count]) => `${action} ${count}`);

        if (actions.length > 0) {
            lines.push(`  recorded as: ${actions.join(", ")}`);
        }
    }

    if (findings.length === 0) {
        lines.push("  no problems found in the ledger itself.");

        return lines;
    }

    lines.push(
        `  ${summary.errors} error(s) and ${summary.warnings} warning(s):`,
    );

    for (const finding of findings.slice(0, FINDING_LIST_LIMIT)) {
        lines.push(
            `    ${finding.severity === "error" ? "ERROR" : "warning"} ${finding.code}: ${finding.message}`,
        );
    }

    if (findings.length > FINDING_LIST_LIMIT) {
        lines.push(
            `    and ${findings.length - FINDING_LIST_LIMIT} more; the full list is in the --outputPath report.`,
        );
    }

    return lines;
};
