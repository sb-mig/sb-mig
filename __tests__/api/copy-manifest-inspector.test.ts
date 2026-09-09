import type {
    CopyManifestFileInput,
    CopyStoryManifestEntry,
} from "../../src/api/copy/index.js";

import { describe, expect, it } from "vitest";

import {
    buildCopyManifestPairList,
    formatCopyManifestInspection,
    formatCopyManifestPairList,
    formatCopyManifestPrunePlan,
    inspectCopyManifests,
    planCopyManifestPrune,
} from "../../src/api/copy/manifest-inspector.js";

const storyEntry = (
    overrides: Partial<CopyStoryManifestEntry> = {},
): CopyStoryManifestEntry => ({
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

const assetEntry = (overrides: Record<string, unknown> = {}) => ({
    type: "asset" as const,
    source_space_id: "111",
    target_space_id: "222",
    action: "created" as const,
    created_at: "2026-09-04T10:00:00.000Z",
    source_id: 9,
    target_id: 99,
    source_filename: "https://a.storyblok.com/f/1/x/same.jpg",
    target_filename: "https://a.storyblok.com/f/2/x/same.jpg",
    ...overrides,
});

const inspect = (files: CopyManifestFileInput[]) =>
    inspectCopyManifests({
        sourceSpaceId: "111",
        targetSpaceId: "222",
        rootDir: ".sb-mig/copy/111/222",
        files,
        generatedAt: "2026-09-09T00:00:00.000Z",
    });

const combined = (entries: any[]): CopyManifestFileInput => ({
    kind: "combined",
    path: ".sb-mig/copy/111/222/manifest.jsonl",
    exists: true,
    entries,
});

describe("copy manifest inspector", () => {
    it("counts the ledger a run would build its maps from", () => {
        const inspection = inspect([
            combined([
                storyEntry(),
                storyEntry({
                    source_id: 2,
                    target_id: 1002,
                    source_uuid: "source-uuid-2",
                    target_uuid: "target-uuid-2",
                    action: "matched_by_target_key",
                }),
                {
                    type: "asset",
                    source_space_id: "111",
                    target_space_id: "222",
                    action: "created",
                    created_at: "2026-09-04T10:00:00.000Z",
                    source_id: 9,
                    target_id: 99,
                    source_filename: "a.png",
                    target_filename: "b.png",
                },
            ]),
        ]);

        expect(inspection.summary).toMatchObject({
            entries: 3,
            stories: 2,
            assets: 1,
            assetFolders: 0,
            // Six per story and two per asset: every runtime map a run keys
            // on, counted from the run's own projection. A story does not map
            // one identity, it maps its id, its uuid, and the target path under
            // both uuids and both ids.
            mappingKeys: 14,
            conflicts: 0,
            duplicates: 0,
            errors: 0,
            warnings: 0,
            byAction: { created: 2, matched_by_target_key: 1 },
        });
        expect(inspection.findings).toEqual([]);
    });

    it("reports a source key mapped to two different targets, and which one wins", () => {
        const inspection = inspect([
            combined([
                storyEntry(),
                storyEntry({ target_id: 5005, target_uuid: "target-uuid-1" }),
            ]),
        ]);

        const conflict = inspection.findings.find(
            (finding) => finding.code === "conflicting_mapping",
        );

        expect(conflict?.severity).toBe("error");
        expect(conflict?.key).toBe("story id 1");
        // The map builder keeps the last line it reads; saying so is the whole
        // point, because the loser is invisible at runtime.
        expect(conflict?.message).toContain("would use 5005");
        expect(inspection.summary.conflicts).toBe(1);
        expect(inspection.summary.errors).toBe(1);
    });

    it("treats a repeated identical mapping as harmless", () => {
        const inspection = inspect([combined([storyEntry(), storyEntry()])]);

        expect(
            inspection.findings.every(
                (finding) => finding.code === "duplicate_mapping",
            ),
        ).toBe(true);
        expect(inspection.summary.errors).toBe(0);
        expect(inspection.summary.duplicates).toBe(6);
    });

    it("warns about story mappings that carry no target path", () => {
        const inspection = inspect([
            combined([storyEntry({ target_full_slug: undefined })]),
        ]);

        expect(inspection.summary.storiesWithoutTargetPath).toBe(1);
        expect(
            inspection.findings.find(
                (finding) => finding.code === "missing_target_full_slug",
            )?.message,
        ).toContain("cached_url");
    });

    it("refuses a mapping written for another space pair", () => {
        const inspection = inspect([
            combined([storyEntry({ target_space_id: "999" })]),
        ]);

        const finding = inspection.findings.find(
            (item) => item.code === "space_pair_mismatch",
        );

        expect(finding?.severity).toBe("error");
        expect(finding?.message).toContain("111 to 999");
    });

    it("catches a mapping recorded only in a per-resource file", () => {
        const inspection = inspect([
            combined([storyEntry()]),
            {
                kind: "stories",
                path: ".sb-mig/copy/111/222/stories.manifest.jsonl",
                exists: true,
                entries: [
                    storyEntry(),
                    storyEntry({
                        source_id: 7,
                        target_id: 1007,
                        source_uuid: "source-uuid-7",
                        target_uuid: "target-uuid-7",
                    }),
                ],
            },
        ]);

        const missing = inspection.findings.filter(
            (finding) => finding.code === "missing_from_combined",
        );

        // Both identities of the orphaned story, and nothing for the one the
        // combined ledger already holds.
        expect(missing.map((finding) => finding.key).sort()).toEqual([
            "story id 7",
            "story path for id 1007",
            "story path for id 7",
            "story path for uuid source-uuid-7",
            "story path for uuid target-uuid-7",
            "story uuid source-uuid-7",
        ]);
        expect(missing.every((finding) => finding.severity === "error")).toBe(
            true,
        );
    });

    it("reports an unreadable file instead of pretending it was empty", () => {
        const inspection = inspect([
            {
                kind: "combined",
                path: ".sb-mig/copy/111/222/manifest.jsonl",
                exists: true,
                error: "Failed to parse manifest at line 3: Unexpected token",
            },
        ]);

        expect(inspection.findings).toEqual([
            {
                code: "unreadable_file",
                severity: "error",
                message:
                    "Ledger file '.sb-mig/copy/111/222/manifest.jsonl' could not be read: Failed to parse manifest at line 3: Unexpected token",
                file: "combined",
            },
        ]);
        expect(inspection.files[0]).toMatchObject({
            exists: true,
            entries: 0,
        });
    });

    it("says a ledger that was never written has not been written", () => {
        const lines = formatCopyManifestInspection(
            inspect([
                {
                    kind: "combined",
                    path: ".sb-mig/copy/111/222/manifest.jsonl",
                    exists: false,
                },
            ]),
        );

        expect(lines).toContain("  combined: not written yet");
        expect(lines).toContain(
            "  nothing has been copied between these spaces yet, or the ledger was moved aside.",
        );
    });

    it("prints a clean ledger as clean", () => {
        const lines = formatCopyManifestInspection(
            inspect([combined([storyEntry()])]),
        );

        expect(lines).toContain("LEDGER");
        expect(lines).toContain("  pair: 111 to 222");
        expect(lines).toContain("  combined: 1 entry");
        expect(lines).toContain("  mappings: 1 story, 0 asset, 0 asset folder");
        expect(lines).toContain("  no problems found in the ledger itself.");
    });

    /* --------------------------------------------------------------- *
     * The false negatives a hand-kept mapping list produced. Each of the
     * three is a ledger Fable crafted by hand and ran the shipped
     * inspector against; each was reported as healthy.
     * --------------------------------------------------------------- */

    it("catches a story remapped to a new target path, which the id and uuid maps cannot see", () => {
        // Crafted ledger 1: the same story, copied twice, recorded under two
        // different target paths. Its id and its uuid never move, so a report
        // that only models those two maps calls this a harmless duplicate —
        // while `storyFullSlugs` last-wins, and every cached_url a relink
        // rewrites through it points at the newer path.
        const inspection = inspect([
            combined([
                storyEntry({ target_full_slug: "dst/OLD-PATH" }),
                storyEntry({
                    target_full_slug: "dst/NEW-PATH",
                    action: "matched_by_target_key",
                }),
            ]),
        ]);

        const pathConflicts = inspection.findings.filter(
            (finding) =>
                finding.code === "conflicting_mapping" &&
                finding.key?.startsWith("story path"),
        );

        expect(pathConflicts.map((finding) => finding.key).sort()).toEqual([
            "story path for id 1",
            "story path for id 1001",
            "story path for uuid source-uuid-1",
            "story path for uuid target-uuid-1",
        ]);
        expect(pathConflicts[0]?.message).toContain(
            "dst/OLD-PATH and dst/NEW-PATH",
        );
        expect(pathConflicts[0]?.message).toContain("would use dst/NEW-PATH");
        expect(inspection.summary.errors).toBeGreaterThan(0);
    });

    it("catches two source assets sharing one filename, which the asset id map cannot see", () => {
        // Crafted ledger 2: two distinct source assets uploaded from the same
        // file name. `assetIds` stays clean because the ids differ; the
        // `assetFilenames` map a rewriter falls back on keeps only the last.
        const inspection = inspect([
            combined([
                assetEntry({
                    source_id: 100,
                    target_id: 200,
                    target_filename: "https://a.storyblok.com/f/2/x/T1.jpg",
                }),
                assetEntry({
                    source_id: 101,
                    target_id: 201,
                    target_filename: "https://a.storyblok.com/f/2/x/T2.jpg",
                }),
            ]),
        ]);

        const conflict = inspection.findings.find(
            (finding) =>
                finding.code === "conflicting_mapping" &&
                finding.key?.startsWith("asset filename"),
        );

        expect(conflict?.severity).toBe("error");
        expect(conflict?.key).toBe(
            "asset filename https://a.storyblok.com/f/1/x/same.jpg",
        );
        expect(conflict?.message).toContain(
            "would use https://a.storyblok.com/f/2/x/T2.jpg",
        );
        expect(inspection.summary.errors).toBe(1);
    });

    it("refuses to count an entry it cannot read as a mapping", () => {
        // Crafted ledger 3: an unknown resource type and an asset with no ids
        // at all. Counted as entries, both inflate the ledger's coverage; the
        // unknown type was even projected as an asset folder keyed `undefined`.
        const inspection = inspect([
            combined([
                {
                    type: "banana",
                    source_space_id: "111",
                    target_space_id: "222",
                    action: "created",
                    created_at: "2026-09-01T00:00:00Z",
                    source_id: 5,
                    target_id: 6,
                },
                {
                    type: "asset",
                    source_space_id: "111",
                    target_space_id: "222",
                    action: "created",
                    created_at: "2026-09-01T00:00:00Z",
                },
            ]),
        ]);

        const invalid = inspection.findings.filter(
            (finding) => finding.code === "invalid_entry",
        );

        expect(invalid).toHaveLength(2);
        expect(invalid[0]?.message).toContain('unknown resource type "banana"');
        expect(invalid[1]?.message).toContain("no numeric source_id");
        expect(inspection.summary).toMatchObject({
            entries: 2,
            stories: 0,
            assets: 0,
            assetFolders: 0,
            // Nothing was readable, so nothing is mapped. A count of 2 here
            // would be the ledger claiming coverage it does not have.
            mappingKeys: 0,
            invalidEntries: 2,
        });
        expect(inspection.summary.errors).toBe(2);
    });

    /* --------------------------------------------------------------- *
     * The deduped view
     * --------------------------------------------------------------- */

    it("collapses superseded lines into the mappings a run would actually use", () => {
        const inspection = inspect([
            combined([
                storyEntry({ target_full_slug: "dst/OLD-PATH" }),
                storyEntry({
                    target_full_slug: "dst/NEW-PATH",
                    action: "matched_by_target_key",
                }),
                assetEntry(),
            ]),
        ]);

        expect(inspection.view).toMatchObject({
            lines: 3,
            mappings: 2,
            matched: 2,
        });
        expect(inspection.view.rows[0]).toMatchObject({
            resource: "story",
            // The later line for the same source is the one a run keeps.
            targetPath: "dst/NEW-PATH",
            action: "matched_by_target_key",
        });
    });

    it("filters the view by resource type and by slug", () => {
        const files = [
            combined([
                storyEntry(),
                storyEntry({
                    source_id: 2,
                    target_id: 1002,
                    source_uuid: "source-uuid-2",
                    target_uuid: "target-uuid-2",
                    source_full_slug: "pages/about",
                    target_full_slug: "imported/pages/about",
                }),
                assetEntry(),
            ]),
        ];

        const byType = inspectCopyManifests({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            rootDir: ".sb-mig/copy/111/222",
            files,
            filters: { types: ["asset"] },
            generatedAt: "2026-09-09T00:00:00.000Z",
        });

        expect(byType.view.mappings).toBe(3);
        expect(byType.view.matched).toBe(1);
        expect(byType.view.rows[0]?.resource).toBe("asset");

        const bySlug = inspectCopyManifests({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            rootDir: ".sb-mig/copy/111/222",
            files,
            filters: { slug: "BLOG" },
            generatedAt: "2026-09-09T00:00:00.000Z",
        });

        // Case-insensitive, and matched against both sides of the mapping.
        expect(bySlug.view.matched).toBe(1);
        expect(bySlug.view.rows[0]?.sourcePath).toBe("blog/post-1");
    });

    /* --------------------------------------------------------------- *
     * Pruning
     * --------------------------------------------------------------- */

    it("plans a prune that removes only lines a run would never act on", () => {
        const plan = planCopyManifestPrune({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            rootDir: ".sb-mig/copy/111/222",
            generatedAt: "2026-09-09T00:00:00.000Z",
            files: [
                combined([
                    storyEntry({ target_full_slug: "dst/OLD-PATH" }),
                    storyEntry({ target_full_slug: "dst/NEW-PATH" }),
                    storyEntry({ target_space_id: "999" }),
                    {
                        type: "banana",
                        source_space_id: "111",
                        target_space_id: "222",
                    },
                    assetEntry(),
                ]),
            ],
        });

        expect(plan.summary).toMatchObject({
            lines: 5,
            keep: 2,
            remove: 3,
            filesToRewrite: 1,
            removedBy: {
                superseded: 1,
                foreign_pair: 1,
                invalid_entry: 1,
            },
        });
        // What survives is exactly what buildCopyMaps ends up with today: the
        // pruned ledger says out loud what the fat one already meant.
        expect(
            plan.files[0]?.entries.map((entry: any) => entry.target_full_slug),
        ).toEqual(["dst/NEW-PATH", undefined]);
    });

    it("never rewrites a file it could not read", () => {
        const plan = planCopyManifestPrune({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            rootDir: ".sb-mig/copy/111/222",
            generatedAt: "2026-09-09T00:00:00.000Z",
            files: [
                {
                    kind: "combined",
                    path: ".sb-mig/copy/111/222/manifest.jsonl",
                    exists: true,
                    error: "Failed to parse manifest at line 3",
                },
            ],
        });

        expect(plan.files[0]?.skipped).toBe(
            "unreadable, left exactly as it is",
        );
        expect(plan.summary.remove).toBe(0);
        expect(formatCopyManifestPrunePlan(plan)).toContain(
            "  combined: unreadable, left exactly as it is",
        );
    });

    it("lists every pair on disk without judging any of them", () => {
        const list = buildCopyManifestPairList({
            root: ".sb-mig/copy",
            generatedAt: "2026-09-09T00:00:00.000Z",
            pairs: [
                {
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    rootDir: ".sb-mig/copy/111/222",
                    files: [combined([storyEntry(), assetEntry()])],
                },
                {
                    sourceSpaceId: "333",
                    targetSpaceId: "444",
                    rootDir: ".sb-mig/copy/333/444",
                    files: [
                        {
                            kind: "combined",
                            path: ".sb-mig/copy/333/444/manifest.jsonl",
                            exists: false,
                        },
                    ],
                },
            ],
        });

        expect(list.pairs[0]).toMatchObject({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            entries: 2,
            stories: 1,
            assets: 1,
            lastRecordedAt: "2026-09-04T10:00:00.000Z",
            unreadable: false,
        });
        expect(list.pairs[1]?.entries).toBe(0);
        expect(formatCopyManifestPairList(list)).toEqual([
            "LEDGERS",
            "  root: .sb-mig/copy",
            "  2 pairs:",
            "    111 -> 222  2 entries (1 story, 1 asset, 0 asset folder), last recorded 2026-09-04T10:00:00.000Z",
            "    333 -> 444  0 entries (0 story, 0 asset, 0 asset folder)",
            "  inspect one with: sb-mig copy manifests --pair <sourceSpaceId>:<targetSpaceId>",
        ]);
    });
});
