import type {
    CopyAssetFolderManifestEntry,
    CopyAssetManifestEntry,
    CopyManifestEntry,
    CopyMaps,
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

export const getDefaultCopyManifestPaths = ({
    sourceSpaceId,
    targetSpaceId,
    rootDir = ".sb-mig",
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    rootDir?: string;
}): CopyManifestPaths => {
    const copyRoot = path.join(rootDir, "copy", sourceSpaceId, targetSpaceId);

    return {
        rootDir: copyRoot,
        combined: path.join(copyRoot, "manifest.jsonl"),
        stories: path.join(copyRoot, "stories.manifest.jsonl"),
        assets: path.join(copyRoot, "assets.manifest.jsonl"),
        assetFolders: path.join(copyRoot, "asset-folders.manifest.jsonl"),
        report: path.join(copyRoot, "report.json"),
    };
};

export const createEmptyCopyMaps = (): CopyMaps => ({
    storyIds: new Map(),
    storyUuids: new Map(),
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

export const buildCopyMaps = (entries: CopyManifestEntry[]): CopyMaps => {
    const maps = createEmptyCopyMaps();

    for (const entry of entries) {
        if (isStoryManifestEntry(entry)) {
            maps.storyIds.set(entry.source_id, entry.target_id);
            maps.storyUuids.set(entry.source_uuid, entry.target_uuid);
        }

        if (isAssetManifestEntry(entry)) {
            maps.assetIds.set(entry.source_id, {
                id: entry.target_id,
                filename: entry.target_filename,
            });
            maps.assetFilenames.set(
                entry.source_filename,
                entry.target_filename,
            );
        }

        if (isAssetFolderManifestEntry(entry)) {
            maps.assetFolderIds.set(entry.source_id, entry.target_id);
        }
    }

    return maps;
};

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
