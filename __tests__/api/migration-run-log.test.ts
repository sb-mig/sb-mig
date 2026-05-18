import { describe, expect, it } from "vitest";

import {
    buildMigrationRunLogRecords,
    recordsToJsonl,
} from "../../src/api/data-migration/migration-run-log.js";

describe("migration run log", () => {
    it("records each update result and the final write summary as JSONL", () => {
        const records = buildMigrationRunLogRecords({
            from: "source-space",
            to: "target-space",
            itemType: "story",
            publish: true,
            publishLanguages: "all",
            resolvedPublishLanguages: ["[default]", "fr", "de"],
            dryRun: false,
            migrateFrom: "space",
            pipelineResult: {
                totalItems: 3,
                finalItems: [],
                stepReports: [
                    {
                        migrationConfig: "carouselToV4",
                        touchedItems: 1,
                        totalComponentReplacements: 1,
                        replacementsByComponent: {
                            "sb-carousel": 1,
                        },
                        maxDepth: 4,
                        validation: null,
                    },
                ],
                changedItems: [
                    {
                        story: {
                            id: "story-1",
                            name: "Home",
                            full_slug: "home",
                        },
                    },
                    {
                        story: {
                            id: "story-2",
                            name: "Broken",
                            full_slug: "broken",
                        },
                    },
                ],
            },
            writeResults: [
                {
                    status: "fulfilled",
                    value: {
                        ok: true,
                        id: "story-1",
                        name: "Home",
                        slug: "home",
                    },
                },
                {
                    status: "fulfilled",
                    value: {
                        ok: false,
                        stage: "publish",
                        id: "story-2",
                        name: "Broken",
                        slug: "broken",
                        spaceId: "target-space",
                        status: 422,
                        response: "The field sb-carousel.content can't be blank",
                    },
                },
            ],
            writeSummary: {
                total: 2,
                successful: 1,
                failed: 1,
                failedItems: [
                    {
                        ok: false,
                        stage: "publish",
                        id: "story-2",
                        name: "Broken",
                        slug: "broken",
                        spaceId: "target-space",
                        status: 422,
                        response: "The field sb-carousel.content can't be blank",
                    },
                ],
            },
        });

        expect(records).toHaveLength(3);
        expect(records[0]).toMatchObject({
            event: "update_success",
            writeMode: "publish",
            publishLanguages: {
                requested: "all",
                resolved: ["[default]", "fr", "de"],
            },
            item: {
                id: "story-1",
                slug: "home",
                spaceId: "target-space",
            },
        });
        expect(records[1]).toMatchObject({
            event: "publish_failed",
            stage: "publish",
            status: 422,
            response: "The field sb-carousel.content can't be blank",
            item: {
                id: "story-2",
                slug: "broken",
                spaceId: "target-space",
            },
        });
        expect(records[2]).toMatchObject({
            event: "migration_write_summary",
            writeSummary: {
                total: 2,
                successful: 1,
                failed: 1,
                failedItems: [
                    {
                        id: "story-2",
                        slug: "broken",
                        status: 422,
                        stage: "publish",
                    },
                ],
            },
        });

        const parsedLines = recordsToJsonl(records)
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));

        expect(parsedLines).toHaveLength(3);
        expect(parsedLines[1].event).toBe("publish_failed");
        expect(parsedLines[2].writeSummary.failed).toBe(1);
    });

    it("records publish skips caused by source publish-state preservation", () => {
        const records = buildMigrationRunLogRecords({
            from: "source-space",
            to: "target-space",
            itemType: "story",
            publish: true,
            publishLanguages: "default",
            resolvedPublishLanguages: ["[default]"],
            dryRun: false,
            migrateFrom: "space",
            pipelineResult: {
                totalItems: 1,
                finalItems: [],
                stepReports: [],
                changedItems: [
                    {
                        story: {
                            id: "story-1",
                            name: "Home",
                            full_slug: "home",
                        },
                    },
                ],
            },
            writeResults: [
                {
                    status: "fulfilled",
                    value: {
                        ok: true,
                        stage: "update",
                        id: "story-1",
                        name: "Home",
                        slug: "home",
                        sourcePublishState:
                            "published_with_unpublished_changes",
                        publishSkippedReason:
                            "source_story_has_unpublished_changes",
                    },
                },
            ],
            writeSummary: {
                total: 1,
                successful: 1,
                failed: 0,
                failedItems: [],
            },
        });

        expect(records[0]).toMatchObject({
            event: "publish_skipped",
            stage: "update",
            sourcePublishState: "published_with_unpublished_changes",
            publishSkippedReason: "source_story_has_unpublished_changes",
            item: {
                id: "story-1",
                slug: "home",
                spaceId: "target-space",
            },
        });
        expect(records[1]).toMatchObject({
            event: "migration_write_summary",
            writeSummary: {
                successful: 1,
                failed: 0,
            },
        });
    });
});
