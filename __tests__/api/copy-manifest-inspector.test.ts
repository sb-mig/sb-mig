import type {
    CopyManifestFileInput,
    CopyStoryManifestEntry,
} from "../../src/api/copy/index.js";

import { describe, expect, it } from "vitest";

import {
    formatCopyManifestInspection,
    inspectCopyManifests,
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
            // Two per story — the id map and the uuid map are separate — plus
            // the asset's own key.
            mappingKeys: 5,
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
        expect(inspection.summary.duplicates).toBe(2);
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
});
