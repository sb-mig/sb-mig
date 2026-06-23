import type { CopyManifestEntry } from "../../src/api/copy/types.js";

import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
    appendManifestEntries,
    appendManifestEntry,
    buildCopyMaps,
    createCopyGraph,
    dedupeManifestEntries,
    dedupeManifestFile,
    getDefaultCopyManifestPaths,
    loadManifest,
    parseManifestJsonl,
    summarizeCopyGraph,
} from "../../src/api/copy/index.js";

const createdTempDirs: string[] = [];

const makeTempDir = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
    createdTempDirs.push(tempDir);
    return tempDir;
};

const storyEntry = (overrides: Partial<CopyManifestEntry> = {}) =>
    ({
        type: "story",
        source_space_id: "source-space",
        target_space_id: "target-space",
        source_id: 100,
        target_id: 200,
        source_uuid: "source-story-uuid",
        target_uuid: "target-story-uuid",
        source_full_slug: "blog/post",
        target_full_slug: "imported/blog/post",
        action: "created",
        created_at: "2026-06-23T12:00:00.000Z",
        ...overrides,
    }) as CopyManifestEntry;

const assetEntry = (overrides: Partial<CopyManifestEntry> = {}) =>
    ({
        type: "asset",
        source_space_id: "source-space",
        target_space_id: "target-space",
        source_id: 300,
        target_id: 400,
        source_filename: "https://a.storyblok.com/f/111/source.jpg",
        target_filename: "https://a.storyblok.com/f/222/target.jpg",
        source_asset_folder_id: 500,
        target_asset_folder_id: 600,
        action: "created",
        created_at: "2026-06-23T12:00:00.000Z",
        ...overrides,
    }) as CopyManifestEntry;

const assetFolderEntry = (overrides: Partial<CopyManifestEntry> = {}) =>
    ({
        type: "asset_folder",
        source_space_id: "source-space",
        target_space_id: "target-space",
        source_id: 500,
        target_id: 600,
        source_name: "Hero",
        target_name: "Hero",
        source_path: "content/hero",
        target_path: "content/hero",
        action: "created",
        created_at: "2026-06-23T12:00:00.000Z",
        ...overrides,
    }) as CopyManifestEntry;

describe("copy manifest store", () => {
    afterEach(async () => {
        await Promise.all(
            createdTempDirs.splice(0).map((tempDir) =>
                rm(tempDir, { recursive: true, force: true }),
            ),
        );
    });

    it("builds default sb-mig copy manifest paths", () => {
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "123",
            targetSpaceId: "456",
        });

        expect(paths.rootDir).toBe(".sb-mig/copy/123/456");
        expect(paths.combined).toBe(".sb-mig/copy/123/456/manifest.jsonl");
        expect(paths.stories).toBe(
            ".sb-mig/copy/123/456/stories.manifest.jsonl",
        );
        expect(paths.assets).toBe(
            ".sb-mig/copy/123/456/assets.manifest.jsonl",
        );
        expect(paths.assetFolders).toBe(
            ".sb-mig/copy/123/456/asset-folders.manifest.jsonl",
        );
        expect(paths.report).toBe(".sb-mig/copy/123/456/report.json");
    });

    it("loads missing manifest files as empty", async () => {
        const tempDir = await makeTempDir();
        const entries = await loadManifest(
            path.join(tempDir, "missing.manifest.jsonl"),
        );

        expect(entries).toEqual([]);
    });

    it("appends and loads JSONL manifest entries", async () => {
        const tempDir = await makeTempDir();
        const manifestPath = path.join(tempDir, "copy", "manifest.jsonl");

        await appendManifestEntry(manifestPath, storyEntry());
        await appendManifestEntries(manifestPath, [
            assetFolderEntry(),
            assetEntry(),
        ]);

        const raw = await readFile(manifestPath, "utf8");
        expect(raw.trim().split("\n")).toHaveLength(3);

        const entries = await loadManifest(manifestPath);
        expect(entries).toEqual([storyEntry(), assetFolderEntry(), assetEntry()]);
    });

    it("reports invalid JSONL with file and line context", () => {
        expect(() =>
            parseManifestJsonl(
                `${JSON.stringify(storyEntry())}\n{not-json}\n`,
                "copy.manifest.jsonl",
            ),
        ).toThrow(
            "Failed to parse manifest 'copy.manifest.jsonl' at line 2",
        );
    });

    it("dedupes manifest entries by source key and keeps the latest mapping", async () => {
        const first = storyEntry({
            target_id: 200,
            target_uuid: "first-target-uuid",
        });
        const latest = storyEntry({
            target_id: 201,
            target_uuid: "latest-target-uuid",
            action: "matched_by_target_key",
        });
        const asset = assetEntry();

        const deduped = dedupeManifestEntries([first, asset, latest]);

        expect(deduped).toEqual([latest, asset]);

        const tempDir = await makeTempDir();
        const manifestPath = path.join(tempDir, "manifest.jsonl");
        await appendManifestEntries(manifestPath, [first, asset, latest]);

        const fileEntries = await dedupeManifestFile(manifestPath);
        expect(fileEntries).toEqual([latest, asset]);
        expect(await loadManifest(manifestPath)).toEqual([latest, asset]);
    });

    it("builds runtime lookup maps for stories, assets, and asset folders", () => {
        const maps = buildCopyMaps([
            storyEntry(),
            assetEntry(),
            assetFolderEntry(),
        ]);

        expect(maps.storyIds.get(100)).toBe(200);
        expect(maps.storyUuids.get("source-story-uuid")).toBe(
            "target-story-uuid",
        );
        expect(maps.assetIds.get(300)).toEqual({
            id: 400,
            filename: "https://a.storyblok.com/f/222/target.jpg",
        });
        expect(
            maps.assetFilenames.get("https://a.storyblok.com/f/111/source.jpg"),
        ).toBe("https://a.storyblok.com/f/222/target.jpg");
        expect(maps.assetFolderIds.get(500)).toBe(600);
    });
});

describe("copy graph model", () => {
    it("creates an empty graph and summarizes graph contents", () => {
        const graph = createCopyGraph({
            sourceSpaceId: "source-space",
            targetSpaceId: "target-space",
            generatedAt: "2026-06-23T12:00:00.000Z",
            scope: {
                command: "copy stories",
                source: "blog",
                destination: "imported",
                mode: "subtree",
                withAssets: true,
                referencePolicy: "preserve",
            },
        });

        graph.stories.push({
            type: "story",
            sourceId: 100,
            sourceUuid: "source-story-uuid",
            sourceFullSlug: "blog/post",
            targetFullSlug: "imported/blog/post",
            action: "create",
        });
        graph.assets.push({
            type: "asset",
            sourceId: 300,
            sourceFilename: "https://a.storyblok.com/f/111/source.jpg",
            action: "create",
        });
        graph.storyReferences.push({
            type: "story_reference",
            sourceStoryId: 100,
            referencedStoryId: 101,
            path: "content.related[0]",
            status: "preserved_external",
        });
        graph.warnings.push({
            code: "external_story_reference",
            message: "External story reference preserved.",
        });

        expect(graph).toMatchObject({
            schemaVersion: 1,
            sourceSpaceId: "source-space",
            targetSpaceId: "target-space",
            scope: {
                command: "copy stories",
                withAssets: true,
                referencePolicy: "preserve",
            },
        });
        expect(summarizeCopyGraph(graph)).toEqual({
            stories: 1,
            assets: 1,
            assetFolders: 0,
            storyReferences: 1,
            warnings: 1,
            errors: 0,
            limitations: 0,
        });
    });
});
