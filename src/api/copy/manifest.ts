import type {
    CopyAssetFolderManifestEntry,
    CopyAssetManifestEntry,
    CopyManifestEntry,
    CopyMaps,
    CopyResourceType,
    CopyStoryManifestEntry,
} from "./types.js";

import fs from "fs/promises";
import path from "path";

export type CopyManifestPaths = {
    rootDir: string;
    combined: string;
    stories: string;
    assets: string;
    assetFolders: string;
    report: string;
};

/**
 * The directory every copy pair's ledger lives under. Kept here so the writers,
 * the readers and anything that enumerates pairs agree on one layout.
 */
export const getCopyManifestRoot = (rootDir = ".sb-mig"): string =>
    path.join(rootDir, "copy");

export const getDefaultCopyManifestPaths = ({
    sourceSpaceId,
    targetSpaceId,
    rootDir = ".sb-mig",
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir?: string;
}): CopyManifestPaths => {
    const copyRoot = path.join(
        getCopyManifestRoot(rootDir),
        sourceSpaceId,
        targetSpaceId,
    );

    return {
        rootDir: copyRoot,
        combined: path.join(copyRoot, "manifest.jsonl"),
        stories: path.join(copyRoot, "stories.manifest.jsonl"),
        assets: path.join(copyRoot, "assets.manifest.jsonl"),
        assetFolders: path.join(copyRoot, "asset-folders.manifest.jsonl"),
        report: path.join(copyRoot, "report.json"),
    };
};

/**
 * Moves every existing manifest file of a copy pair aside so the next run
 * starts with an empty ledger. Nothing is deleted: each file is renamed with
 * a timestamp suffix next to the original. Returns the archived paths.
 */
export const archiveCopyManifests = async (
    paths: CopyManifestPaths,
    now: Date = new Date(),
): Promise<string[]> => {
    const suffix = now.toISOString().replace(/[:.]/g, "-");
    const archived: string[] = [];

    for (const filePath of [
        paths.combined,
        paths.stories,
        paths.assets,
        paths.assetFolders,
    ]) {
        const archivePath = `${filePath}.${suffix}.bak`;

        try {
            await fs.rename(filePath, archivePath);
            archived.push(archivePath);
        } catch (error: any) {
            if (error?.code !== "ENOENT") {
                throw error;
            }
        }
    }

    return archived;
};

export const createEmptyCopyMaps = (): CopyMaps => ({
    storyIds: new Map(),
    storyUuids: new Map(),
    storyFullSlugs: new Map(),
    storyIdFullSlugs: new Map(),
    assetIds: new Map(),
    assetFilenames: new Map(),
    assetFolderIds: new Map(),
});

export const loadManifest = async <T extends CopyManifestEntry>(
    filePath: string,
): Promise<T[]> => {
    try {
        const content = await fs.readFile(filePath, "utf8");
        return parseManifestJsonl<T>(content, filePath);
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return [];
        }

        throw error;
    }
};

export const parseManifestJsonl = <T extends CopyManifestEntry>(
    content: string,
    filePath = "manifest.jsonl",
): T[] =>
    content
        .split("\n")
        .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
        .filter(({ line }) => line.length > 0)
        .map(({ line, lineNumber }) => {
            try {
                return JSON.parse(line) as T;
            } catch (error: any) {
                throw new Error(
                    `Failed to parse manifest '${filePath}' at line ${lineNumber}: ${error.message}`,
                );
            }
        });

export const appendManifestEntry = async (
    filePath: string,
    entry: CopyManifestEntry,
): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
};

export const appendManifestEntries = async (
    filePath: string,
    entries: CopyManifestEntry[],
): Promise<void> => {
    if (entries.length === 0) {
        return;
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(
        filePath,
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
        "utf8",
    );
};

export const writeManifest = async (
    filePath: string,
    entries: CopyManifestEntry[],
): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content =
        entries.length > 0
            ? entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
            : "";

    await fs.writeFile(filePath, content, "utf8");
};

export const dedupeManifestEntries = <T extends CopyManifestEntry>(
    entries: T[],
): T[] => {
    const byKey = new Map<string, T>();

    for (const entry of entries) {
        byKey.set(getManifestEntrySourceKey(entry), entry);
    }

    return Array.from(byKey.values());
};

export const dedupeManifestFile = async (
    filePath: string,
): Promise<CopyManifestEntry[]> => {
    const entries = await loadManifest(filePath);
    const deduped = dedupeManifestEntries(entries);

    await writeManifest(filePath, deduped);

    return deduped;
};

/** The runtime maps a ledger entry can write to. */
export type CopyMapName = keyof CopyMaps;

/**
 * One write a ledger entry performs on the maps a copy run rewrites content
 * through. Expressed once, here, so that everything which has to reason about
 * what a ledger means at runtime — the run itself, and anything that reads the
 * ledger back — is looking at the same list. A second, hand-kept description of
 * these writes would drift, and the first thing it would lose is a map nobody
 * remembered a ledger entry touches.
 */
export type CopyMapWrite = {
    map: CopyMapName;
    key: string | number;
    value: unknown;
};

/**
 * Every map write one entry performs, in the order a run performs them, so the
 * last write for a key is the value a run ends up using.
 *
 * The target path is only recorded when the entry carries one: an unknown path
 * must leave `cached_url` alone rather than guess it. An entry of an unknown
 * shape writes nothing — see `validateCopyManifestEntry`.
 */
export const getCopyMapWrites = (entry: CopyManifestEntry): CopyMapWrite[] => {
    if (isStoryManifestEntry(entry)) {
        const writes: CopyMapWrite[] = [
            { map: "storyIds", key: entry.source_id, value: entry.target_id },
            {
                map: "storyUuids",
                key: entry.source_uuid,
                value: entry.target_uuid,
            },
        ];

        if (entry.target_full_slug) {
            writes.push(
                {
                    map: "storyFullSlugs",
                    key: entry.source_uuid,
                    value: entry.target_full_slug,
                },
                {
                    map: "storyFullSlugs",
                    key: entry.target_uuid,
                    value: entry.target_full_slug,
                },
                {
                    map: "storyIdFullSlugs",
                    key: entry.source_id,
                    value: entry.target_full_slug,
                },
                {
                    map: "storyIdFullSlugs",
                    key: entry.target_id,
                    value: entry.target_full_slug,
                },
            );
        }

        return writes;
    }

    if (isAssetManifestEntry(entry)) {
        return [
            {
                map: "assetIds",
                key: entry.source_id,
                value: { id: entry.target_id, filename: entry.target_filename },
            },
            {
                map: "assetFilenames",
                key: entry.source_filename,
                value: entry.target_filename,
            },
        ];
    }

    if (isAssetFolderManifestEntry(entry)) {
        return [
            {
                map: "assetFolderIds",
                key: entry.source_id,
                value: entry.target_id,
            },
        ];
    }

    return [];
};

export const applyCopyMapWrites = (maps: CopyMaps, writes: CopyMapWrite[]) => {
    for (const write of writes) {
        (maps[write.map] as Map<unknown, unknown>).set(write.key, write.value);
    }
};

/**
 * Records one written story mapping in the maps the rewriter reads.
 */
export const applyStoryManifestEntryToMaps = (
    maps: CopyMaps,
    entry: CopyStoryManifestEntry,
) => {
    applyCopyMapWrites(maps, getCopyMapWrites(entry));
};

export const buildCopyMaps = (entries: CopyManifestEntry[]): CopyMaps => {
    const maps = createEmptyCopyMaps();

    for (const entry of entries) {
        applyCopyMapWrites(maps, getCopyMapWrites(entry));
    }

    return maps;
};

const COPY_RESOURCE_TYPES: CopyResourceType[] = [
    "story",
    "asset",
    "asset_folder",
];

export const isCopyResourceType = (value: unknown): value is CopyResourceType =>
    COPY_RESOURCE_TYPES.includes(value as CopyResourceType);

const isPresentNumber = (value: unknown): boolean =>
    typeof value === "number" && Number.isFinite(value);

const isPresentString = (value: unknown): boolean =>
    typeof value === "string" && value.length > 0;

/**
 * The fields a ledger entry must carry for a run to make any use of it, checked
 * because a ledger is an append-only file that hand edits, older versions and
 * interrupted writes all reach. An entry that fails here maps nothing: reading
 * it as if it did would invent identities out of `undefined`, and every value
 * derived from it — counts, mappings, conflict findings — would be a fiction.
 *
 * Returns one plain reason per problem, and nothing when the entry is usable.
 */
export const validateCopyManifestEntry = (entry: unknown): string[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return ["the entry is not a JSON object"];
    }

    const candidate = entry as Record<string, unknown>;
    const problems: string[] = [];

    if (!isPresentString(candidate["source_space_id"])) {
        problems.push("no source_space_id");
    }

    if (!isPresentString(candidate["target_space_id"])) {
        problems.push("no target_space_id");
    }

    if (!isCopyResourceType(candidate["type"])) {
        problems.push(
            `unknown resource type ${JSON.stringify(candidate["type"] ?? null)}`,
        );

        return problems;
    }

    if (!isPresentNumber(candidate["source_id"])) {
        problems.push("no numeric source_id");
    }

    if (!isPresentNumber(candidate["target_id"])) {
        problems.push("no numeric target_id");
    }

    if (candidate["type"] === "story") {
        if (!isPresentString(candidate["source_uuid"])) {
            problems.push("no source_uuid");
        }

        if (!isPresentString(candidate["target_uuid"])) {
            problems.push("no target_uuid");
        }
    }

    if (candidate["type"] === "asset") {
        if (!isPresentString(candidate["source_filename"])) {
            problems.push("no source_filename");
        }

        if (!isPresentString(candidate["target_filename"])) {
            problems.push("no target_filename");
        }
    }

    return problems;
};

/**
 * The identity `dedupeManifestEntries` treats as one mapping: the source side of
 * an entry, within its own space pair.
 */
export /**
 * The identity `dedupeManifestEntries` treats as one mapping: the source side of
 * an entry, within its own space pair.
 */
const getManifestEntrySourceKey = (entry: CopyManifestEntry): string => {
    if (isStoryManifestEntry(entry)) {
        return [
            entry.type,
            entry.source_space_id,
            entry.target_space_id,
            entry.source_id,
            entry.source_uuid,
        ].join(":");
    }

    return [
        entry.type,
        entry.source_space_id,
        entry.target_space_id,
        entry.source_id,
    ].join(":");
};

const isStoryManifestEntry = (
    entry: CopyManifestEntry,
): entry is CopyStoryManifestEntry => entry.type === "story";

const isAssetManifestEntry = (
    entry: CopyManifestEntry,
): entry is CopyAssetManifestEntry => entry.type === "asset";

const isAssetFolderManifestEntry = (
    entry: CopyManifestEntry,
): entry is CopyAssetFolderManifestEntry => entry.type === "asset_folder";
