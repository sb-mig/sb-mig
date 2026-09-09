import type {
    CopyAction,
    CopyManifestEntry,
    CopyResourceType,
    CopyStoryManifestEntry,
} from "./types.js";

import {
    dedupeManifestEntries,
    getCopyMapWrites,
    getManifestEntrySourceKey,
    type CopyMapName,
    validateCopyManifestEntry,
} from "./manifest.js";

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
    | "invalid_entry"
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

/** One mapping a run would use, after the ledger's own last-line-wins dedupe. */
export type CopyManifestMappingRow = {
    resource: CopyResourceType;
    action: CopyAction;
    recordedAt: string;
    sourceId: number;
    targetId: number;
    sourceUuid?: string;
    targetUuid?: string;
    /** Story `full_slug`, asset filename, or asset folder path, when recorded. */
    sourcePath?: string;
    targetPath?: string;
};

export type CopyManifestViewFilters = {
    types?: CopyResourceType[];
    slug?: string;
};

export type CopyManifestPairView = {
    /** Lines in the combined ledger, before anything is collapsed. */
    lines: number;
    /** Mappings left once every superseded line is collapsed away. */
    mappings: number;
    /** Mappings left after --type/--slug. Equals `mappings` with no filters. */
    matched: number;
    filters: CopyManifestViewFilters;
    rows: CopyManifestMappingRow[];
};

export type CopyManifestInspection = {
    schemaVersion: 1;
    command: "copy manifests";
    /** Which of the command's three artifacts this is. */
    mode: "pair";
    generatedAt: string;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
        rootDir: string;
    };
    files: CopyManifestFileReport[];
    view: CopyManifestPairView;
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
        invalidEntries: number;
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
 * The runtime maps named the way a report has to name them: a finding is only
 * useful if it says which map a run would read the wrong value out of.
 */
const MAP_LABELS: Record<CopyMapName, string> = {
    storyIds: "story id",
    storyUuids: "story uuid",
    storyFullSlugs: "story path for uuid",
    storyIdFullSlugs: "story path for id",
    assetIds: "asset id",
    assetFilenames: "asset filename",
    assetFolderIds: "asset folder id",
};

const MAP_RESOURCES: Record<CopyMapName, CopyResourceType> = {
    storyIds: "story",
    storyUuids: "story",
    storyFullSlugs: "story",
    storyIdFullSlugs: "story",
    assetIds: "asset",
    assetFilenames: "asset",
    assetFolderIds: "asset_folder",
};

const describeMapValue = (value: unknown): string => {
    if (value && typeof value === "object") {
        const asset = value as { id?: unknown; filename?: unknown };

        if (asset.filename !== undefined) {
            return `${asset.id} (${asset.filename})`;
        }
    }

    return String(value);
};

/**
 * Every identity a ledger entry claims, keyed exactly as `buildCopyMaps` keys
 * it. Read straight off the run's own projection rather than restated here: a
 * story writes six mappings, not one, across four maps that can disagree with
 * each other, and a map this function forgot is a map whose conflicts would go
 * unreported while a run quietly read the loser.
 */
const getEntryMappings = (
    entry: CopyManifestEntry,
): {
    mapKey: string;
    label: string;
    resource: CopyResourceType;
    value: string;
}[] =>
    getCopyMapWrites(entry).map((write) => ({
        mapKey: `${write.map}:${write.key}`,
        label: `${MAP_LABELS[write.map]} ${write.key}`,
        resource: MAP_RESOURCES[write.map],
        value: describeMapValue(write.value),
    }));

const buildMappingRow = (entry: CopyManifestEntry): CopyManifestMappingRow => {
    if (isStoryEntry(entry)) {
        return {
            resource: "story",
            action: entry.action,
            recordedAt: entry.created_at,
            sourceId: entry.source_id,
            targetId: entry.target_id,
            sourceUuid: entry.source_uuid,
            targetUuid: entry.target_uuid,
            ...(entry.source_full_slug
                ? { sourcePath: entry.source_full_slug }
                : {}),
            ...(entry.target_full_slug
                ? { targetPath: entry.target_full_slug }
                : {}),
        };
    }

    if (entry.type === "asset") {
        return {
            resource: "asset",
            action: entry.action,
            recordedAt: entry.created_at,
            sourceId: entry.source_id,
            targetId: entry.target_id,
            sourcePath: entry.source_filename,
            targetPath: entry.target_filename,
        };
    }

    return {
        resource: "asset_folder",
        action: entry.action,
        recordedAt: entry.created_at,
        sourceId: entry.source_id,
        targetId: entry.target_id,
        ...(entry.source_path ? { sourcePath: entry.source_path } : {}),
        ...(entry.target_path ? { targetPath: entry.target_path } : {}),
    };
};

const rowMatchesFilters = (
    row: CopyManifestMappingRow,
    filters: CopyManifestViewFilters,
): boolean => {
    if (filters.types && filters.types.length > 0) {
        if (!filters.types.includes(row.resource)) {
            return false;
        }
    }

    if (filters.slug) {
        const needle = filters.slug.toLowerCase();
        const haystacks = [row.sourcePath, row.targetPath].filter(
            (value): value is string => Boolean(value),
        );

        if (!haystacks.some((value) => value.toLowerCase().includes(needle))) {
            return false;
        }
    }

    return true;
};

/**
 * The mappings a run would actually use: the ledger is append-only and a later
 * line for the same source silently replaces an earlier one, so the raw lines
 * are a history and only the collapsed set is the state.
 */
export const buildCopyManifestPairView = ({
    entries,
    validEntries,
    filters = {},
}: {
    entries: CopyManifestEntry[];
    validEntries: CopyManifestEntry[];
    filters?: CopyManifestViewFilters;
}): CopyManifestPairView => {
    const deduped = dedupeManifestEntries(validEntries);
    const rows = deduped.map(buildMappingRow);
    const matched = rows.filter((row) => rowMatchesFilters(row, filters));

    return {
        lines: entries.length,
        mappings: rows.length,
        matched: matched.length,
        filters,
        rows: matched,
    };
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
    filters = {},
    generatedAt = new Date().toISOString(),
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir: string;
    files: CopyManifestFileInput[];
    filters?: CopyManifestViewFilters;
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
        { resource: CopyResourceType; label: string; values: string[] }
    >();
    const validCombined: CopyManifestEntry[] = [];
    let invalidEntries = 0;
    let storiesWithoutTargetPath = 0;

    for (const [index, entry] of combined.entries()) {
        // An entry a run cannot read is not a mapping, and counting it as one
        // would report coverage the ledger does not have.
        const problems = validateCopyManifestEntry(entry);

        if (problems.length > 0) {
            invalidEntries += 1;
            findings.push({
                code: "invalid_entry",
                severity: "error",
                message: `Entry ${index + 1} of the combined ledger cannot be used: ${problems.join(", ")}. It maps nothing, and every count that treated it as a mapping would be wrong.`,
                file: "combined",
            });
            continue;
        }

        validCombined.push(entry);
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
            const existing = targetsByKey.get(mapping.mapKey);

            if (existing) {
                existing.values.push(mapping.value);
                continue;
            }

            targetsByKey.set(mapping.mapKey, {
                resource: mapping.resource,
                label: mapping.label,
                values: [mapping.value],
            });
        }
    }

    let conflicts = 0;
    let duplicates = 0;

    for (const { resource, label, values } of targetsByKey.values()) {
        if (values.length < 2) {
            continue;
        }

        const distinct = [...new Set(values)];

        if (distinct.length > 1) {
            conflicts += 1;
            findings.push({
                code: "conflicting_mapping",
                severity: "error",
                message: `${label} maps to ${distinct.join(" and ")}. A run keeps the last line it reads, so it would use ${values[values.length - 1]} and silently ignore the rest.`,
                resource,
                key: label,
                file: "combined",
            });
            continue;
        }

        duplicates += 1;
        findings.push({
            code: "duplicate_mapping",
            severity: "warning",
            message: `${label} is recorded ${values.length} times with the same target. Harmless: the MAPPINGS block above already shows the single mapping a run would use.`,
            resource,
            key: label,
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

        const missing = new Map<string, string>();

        for (const [index, entry] of file.entries.entries()) {
            const problems = validateCopyManifestEntry(entry);

            if (problems.length > 0) {
                invalidEntries += 1;
                findings.push({
                    code: "invalid_entry",
                    severity: "error",
                    message: `Entry ${index + 1} of '${file.path}' cannot be used: ${problems.join(", ")}. It maps nothing, and every count that treated it as a mapping would be wrong.`,
                    file: file.kind,
                });
                continue;
            }

            for (const mapping of getEntryMappings(entry)) {
                if (!targetsByKey.has(mapping.mapKey)) {
                    missing.set(mapping.mapKey, mapping.label);
                }
            }
        }

        for (const label of missing.values()) {
            findings.push({
                code: "missing_from_combined",
                severity: "error",
                message: `${label} is recorded in ${file.path} but not in the combined ledger, which is the only file a copy run reads. This mapping cannot be reused.`,
                key: label,
                file: file.kind,
            });
        }
    }

    const countType = (type: CopyResourceType) =>
        validCombined.filter((entry) => entry.type === type).length;

    return {
        schemaVersion: 1,
        command: "copy manifests",
        mode: "pair",
        generatedAt,
        normalized: { sourceSpaceId, targetSpaceId, rootDir },
        files: files.map(({ kind, path, exists, entries, error }) => ({
            kind,
            path,
            exists,
            entries: entries?.length ?? 0,
            ...(error ? { error } : {}),
        })),
        view: buildCopyManifestPairView({
            entries: combined,
            validEntries: validCombined,
            filters,
        }),
        summary: {
            entries: combined.length,
            stories: countType("story"),
            assets: countType("asset"),
            assetFolders: countType("asset_folder"),
            byAction,
            mappingKeys: targetsByKey.size,
            conflicts,
            duplicates,
            invalidEntries,
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
const ROW_LIST_LIMIT = 50;

const FILE_LABELS: Record<CopyManifestFileKind, string> = {
    combined: "combined",
    stories: "stories",
    assets: "assets",
    assetFolders: "asset folders",
};

const RESOURCE_LABELS: Record<CopyResourceType, string> = {
    story: "story",
    asset: "asset",
    asset_folder: "asset folder",
};

const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;

const describeRow = (row: CopyManifestMappingRow): string[] => {
    const source = row.sourcePath ?? "(no source path recorded)";
    const target = row.targetPath ?? "(no target path recorded)";
    const identity = [`id ${row.sourceId} -> ${row.targetId}`];

    if (row.sourceUuid && row.targetUuid) {
        identity.push(`uuid ${row.sourceUuid} -> ${row.targetUuid}`);
    }

    return [
        `    ${RESOURCE_LABELS[row.resource]}  ${source} -> ${target}`,
        `      ${identity.join(", ")}, ${row.action} ${row.recordedAt}`,
    ];
};

const describeFilters = (filters: CopyManifestViewFilters): string => {
    const parts: string[] = [];

    if (filters.types && filters.types.length > 0) {
        parts.push(
            `type ${filters.types.map((type) => RESOURCE_LABELS[type]).join(" or ")}`,
        );
    }

    if (filters.slug) {
        parts.push(`slug containing '${filters.slug}'`);
    }

    return parts.join(", ");
};

/**
 * The ledger read out loud, in the same vocabulary the PLAN block uses so the
 * two can be read side by side.
 */
export const formatCopyManifestInspection = (
    inspection: CopyManifestInspection,
): string[] => {
    const { normalized, summary, files, view } = inspection;
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
                ? `  ${label}: ${file.entries} ${plural(file.entries, "entry", "entries")}`
                : `  ${label}: not written yet`,
        );
    }

    if (summary.entries === 0) {
        // An unreadable file is not an empty ledger, and saying so would be the
        // one sentence a caller must not read here.
        if (!files.some((file) => file.error)) {
            lines.push(
                "  nothing has been copied between these spaces yet, or the ledger was moved aside.",
            );
        }

        return [...lines, ...formatHealth(inspection)];
    }

    lines.push(
        `  mappings: ${summary.stories} story, ${summary.assets} asset, ${summary.assetFolders} asset folder`,
    );

    const actions = Object.entries(summary.byAction)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([action, count]) => `${action} ${count}`);

    if (actions.length > 0) {
        lines.push(`  recorded as: ${actions.join(", ")}`);
    }

    const filterLabel = describeFilters(view.filters);

    lines.push(
        "MAPPINGS",
        `  ${view.mappings} ${plural(view.mappings, "mapping", "mappings")} from ${view.lines} ledger ${plural(view.lines, "line", "lines")}${
            view.mappings === view.lines
                ? ""
                : `; ${view.lines - view.mappings} superseded or unusable ${plural(view.lines - view.mappings, "line", "lines")} collapsed away`
        }.`,
    );

    if (filterLabel) {
        lines.push(`  showing ${view.matched} matching ${filterLabel}.`);
    }

    if (view.rows.length === 0) {
        lines.push(
            filterLabel
                ? "    nothing matches this filter."
                : "    no usable mapping in this ledger.",
        );
    }

    for (const row of view.rows.slice(0, ROW_LIST_LIMIT)) {
        lines.push(...describeRow(row));
    }

    if (view.rows.length > ROW_LIST_LIMIT) {
        lines.push(
            `    and ${view.rows.length - ROW_LIST_LIMIT} more; narrow with --type/--slug, or read them all from the --outputPath report.`,
        );
    }

    return [...lines, ...formatHealth(inspection)];
};

const formatHealth = ({
    summary,
    findings,
}: CopyManifestInspection): string[] => {
    const lines = ["HEALTH"];

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

/* ------------------------------------------------------------------ *
 * Listing every pair on disk
 * ------------------------------------------------------------------ */

export type CopyManifestPairSummary = {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir: string;
    /** The resolved absolute directory, so the line names a real place on disk. */
    path: string;
    files: CopyManifestFileReport[];
    entries: number;
    stories: number;
    assets: number;
    assetFolders: number;
    /**
     * The combined ledger file's real mtime. The newest `created_at` inside the
     * file is when a copy run said it wrote something; this is when the file
     * was actually last touched, which is the question "how stale is this?"
     * really asks — and the only one of the two a hand edit cannot fake.
     */
    lastWrittenAt?: string;
    unreadable: boolean;
};

export type CopyManifestPairList = {
    schemaVersion: 1;
    command: "copy manifests";
    mode: "ledgers";
    generatedAt: string;
    root: string;
    pairs: CopyManifestPairSummary[];
};

export type CopyManifestPairInput = {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir: string;
    path: string;
    /** ISO mtime of the combined ledger file, absent when it does not exist. */
    lastWrittenAt?: string;
    files: CopyManifestFileInput[];
};

/**
 * Every pair that has a ledger on disk, counted but not judged. Listing is the
 * answer to "what has this working copy ever copied", which has to be
 * answerable without naming a pair — and without guessing one either.
 */
export const buildCopyManifestPairList = ({
    root,
    pairs,
    generatedAt = new Date().toISOString(),
}: {
    root: string;
    pairs: CopyManifestPairInput[];
    generatedAt?: string;
}): CopyManifestPairList => ({
    schemaVersion: 1,
    command: "copy manifests",
    mode: "ledgers",
    generatedAt,
    root,
    pairs: pairs.map((pair) => {
        const combinedFile = pair.files.find(
            (file) => file.kind === "combined",
        );
        const combined = combinedFile?.entries ?? [];
        const countType = (type: CopyResourceType) =>
            combined.filter((entry) => entry.type === type).length;

        return {
            sourceSpaceId: pair.sourceSpaceId,
            targetSpaceId: pair.targetSpaceId,
            rootDir: pair.rootDir,
            path: pair.path,
            files: pair.files.map(({ kind, path, exists, entries, error }) => ({
                kind,
                path,
                exists,
                entries: entries?.length ?? 0,
                ...(error ? { error } : {}),
            })),
            entries: combined.length,
            stories: countType("story"),
            assets: countType("asset"),
            assetFolders: countType("asset_folder"),
            ...(pair.lastWrittenAt
                ? { lastWrittenAt: pair.lastWrittenAt }
                : {}),
            unreadable: pair.files.some((file) => Boolean(file.error)),
        };
    }),
});

export const formatCopyManifestPairList = (
    list: CopyManifestPairList,
): string[] => {
    const lines = ["LEDGERS", `  root: ${list.root}`];

    if (list.pairs.length === 0) {
        lines.push(
            "  no copy ledger found under this root. One appears the first time copy stories or copy assets writes to a space pair.",
        );

        return lines;
    }

    lines.push(
        `  ${list.pairs.length} ${plural(list.pairs.length, "pair", "pairs")}:`,
    );

    for (const pair of list.pairs) {
        lines.push(
            `    ${pair.sourceSpaceId} -> ${pair.targetSpaceId}  ${pair.entries} ${plural(pair.entries, "entry", "entries")} (${pair.stories} story, ${pair.assets} asset, ${pair.assetFolders} asset folder)${pair.unreadable ? ", SOME FILES UNREADABLE" : ""}`,
            `      ${pair.path}`,
            `      last written ${pair.lastWrittenAt ?? "never"}`,
        );
    }

    lines.push(
        "  inspect one with: sb-mig copy manifests --pair <sourceSpaceId>:<targetSpaceId>",
    );

    return lines;
};

/* ------------------------------------------------------------------ *
 * Removing a pair's ledger entirely (--prune)
 * ------------------------------------------------------------------ */

/** The known ledger files. Anything else in the directory is worth shouting about. */
const KNOWN_LEDGER_FILES = new Set([
    "manifest.jsonl",
    "stories.manifest.jsonl",
    "assets.manifest.jsonl",
    "asset-folders.manifest.jsonl",
    "report.json",
]);

export type CopyManifestRemovalEntryKind =
    | "file"
    | "directory"
    | "symlink"
    | "other";

export type CopyManifestRemovalEntry = {
    /** Path relative to the pair directory, so the plan reads as a tree. */
    path: string;
    kind: CopyManifestRemovalEntryKind;
    bytes: number;
    /** Where a symlink points, disclosed because the plan must not hide it. */
    target?: string;
    /**
     * True when this is not one of the ledger files this command wrote. A
     * recursive delete does not care what it finds, so the plan has to.
     */
    unexpected: boolean;
};

export type CopyManifestRemovalPlan = {
    schemaVersion: 1;
    command: "copy manifests --prune";
    mode: "prune";
    generatedAt: string;
    normalized: {
        sourceSpaceId: string;
        targetSpaceId: string;
    };
    /** The one resolved absolute directory that will be deleted, and nothing else. */
    path: string;
    exists: boolean;
    entries: CopyManifestRemovalEntry[];
    summary: {
        files: number;
        directories: number;
        symlinks: number;
        other: number;
        bytes: number;
        unexpected: number;
    };
};

export const isKnownCopyLedgerFile = (relativePath: string): boolean =>
    KNOWN_LEDGER_FILES.has(relativePath) ||
    // The archives --fresh and earlier runs leave next to the originals.
    /^[^/\\]+\.jsonl\.[-0-9TZ]+\.bak$/.test(relativePath);

/**
 * What `--prune` would delete, listed in full.
 *
 * A recursive delete removes whatever it finds, so a plan that lists only the
 * top-level ledger files is a plan that lies by omission: a nested directory or
 * a symlink somebody dropped in there goes with it, unmentioned. Every entry is
 * disclosed, with the ones this command did not write called out.
 */
export const buildCopyManifestRemovalPlan = ({
    sourceSpaceId,
    targetSpaceId,
    path: dir,
    exists,
    entries,
    generatedAt = new Date().toISOString(),
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    path: string;
    exists: boolean;
    entries: CopyManifestRemovalEntry[];
    generatedAt?: string;
}): CopyManifestRemovalPlan => ({
    schemaVersion: 1,
    command: "copy manifests --prune",
    mode: "prune",
    generatedAt,
    normalized: { sourceSpaceId, targetSpaceId },
    path: dir,
    exists,
    entries,
    summary: {
        files: entries.filter((entry) => entry.kind === "file").length,
        directories: entries.filter((entry) => entry.kind === "directory")
            .length,
        symlinks: entries.filter((entry) => entry.kind === "symlink").length,
        other: entries.filter((entry) => entry.kind === "other").length,
        bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
        unexpected: entries.filter((entry) => entry.unexpected).length,
    },
});

const REMOVAL_KIND_LABELS: Record<CopyManifestRemovalEntryKind, string> = {
    file: "file",
    directory: "dir",
    symlink: "symlink",
    other: "other",
};

export const formatCopyManifestRemovalPlan = (
    plan: CopyManifestRemovalPlan,
): string[] => {
    const lines = [
        "PRUNE PLAN",
        `  pair: ${plan.normalized.sourceSpaceId} to ${plan.normalized.targetSpaceId}`,
        `  delete: ${plan.path}`,
    ];

    if (!plan.exists) {
        lines.push(
            "  nothing to prune: there is no ledger directory for this pair.",
        );

        return lines;
    }

    if (plan.entries.length === 0) {
        lines.push("    (the directory is empty)");
    }

    for (const entry of plan.entries) {
        const label = REMOVAL_KIND_LABELS[entry.kind];
        const detail =
            entry.kind === "symlink"
                ? ` -> ${entry.target ?? "?"}`
                : entry.kind === "directory"
                  ? ""
                  : ` (${entry.bytes} bytes)`;

        lines.push(
            `    ${label}  ${entry.path}${detail}${entry.unexpected ? "   NOT WRITTEN BY copy manifests" : ""}`,
        );
    }

    const counted = [
        `${plan.summary.files} ${plural(plan.summary.files, "file", "files")}`,
        `${plan.summary.directories} ${plural(plan.summary.directories, "directory", "directories")}`,
        `${plan.summary.symlinks} ${plural(plan.summary.symlinks, "symlink", "symlinks")}`,
    ];

    if (plan.summary.other > 0) {
        lines.push(
            `  ${plan.summary.other} entr${plan.summary.other === 1 ? "y is" : "ies are"} neither a file, a directory nor a symlink.`,
        );
    }

    if (plan.summary.unexpected > 0) {
        lines.push(
            `  ${plan.summary.unexpected} of these ${plural(plan.summary.unexpected, "entry was", "entries were")} not written by copy manifests. A recursive delete takes them too.`,
        );
    }

    lines.push(
        `  ${counted.join(", ")}, ${plan.summary.bytes} bytes. This DELETES the directory above and everything listed in it; it is not archived, and a copy run that resumed from it will start over.`,
    );

    return lines;
};
