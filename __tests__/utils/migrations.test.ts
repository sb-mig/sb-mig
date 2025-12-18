import { describe, it, expect } from "vitest";

import {
    preselectMigrations,
    type VersionMapping,
} from "../../src/utils/migrations.js";

describe("preselectMigrations - migration selection logic", () => {
    const versionMapping: VersionMapping = {
        "1.0.0": ["initialMigration"],
        "1.1.0": ["addNewField", "updateSchema"],
        "1.2.0": ["removeDeprecated"],
        "2.0.0": ["breakingChange", "newFeature"],
        "2.1.0": ["minorFix"],
    };

    describe("version range selection", () => {
        it("should select migrations between current and installed version", () => {
            const result = preselectMigrations(
                "1.0.0", // current version
                "1.2.0", // installed (target) version
                versionMapping,
            );

            // Should include 1.1.0 and 1.2.0 migrations (not 1.0.0)
            expect(result.story).toContain("addNewField");
            expect(result.story).toContain("updateSchema");
            expect(result.story).toContain("removeDeprecated");
            expect(result.story).not.toContain("initialMigration");
        });

        it("should not include migrations for versions above installed", () => {
            const result = preselectMigrations(
                "1.0.0",
                "1.1.0",
                versionMapping,
            );

            expect(result.story).toContain("addNewField");
            expect(result.story).toContain("updateSchema");
            expect(result.story).not.toContain("removeDeprecated");
            expect(result.story).not.toContain("breakingChange");
        });

        it("should return empty arrays when versions are the same", () => {
            const result = preselectMigrations(
                "1.1.0",
                "1.1.0",
                versionMapping,
            );

            expect(result.story).toEqual([]);
            expect(result.preset).toEqual([]);
        });

        it("should handle major version jumps", () => {
            const result = preselectMigrations(
                "1.0.0",
                "2.1.0",
                versionMapping,
            );

            // Should include all migrations from 1.1.0 through 2.1.0
            expect(result.story).toContain("addNewField");
            expect(result.story).toContain("breakingChange");
            expect(result.story).toContain("minorFix");
        });
    });

    describe("already applied migrations filtering", () => {
        it("should filter out already applied story migrations", () => {
            const alreadyApplied = {
                story: ["addNewField"],
                preset: [],
            };

            const result = preselectMigrations(
                "1.0.0",
                "1.2.0",
                versionMapping,
                alreadyApplied,
            );

            expect(result.story).not.toContain("addNewField");
            expect(result.story).toContain("updateSchema");
            expect(result.story).toContain("removeDeprecated");
        });

        it("should filter out already applied preset migrations", () => {
            const alreadyApplied = {
                story: [],
                preset: ["updateSchema"],
            };

            const result = preselectMigrations(
                "1.0.0",
                "1.2.0",
                versionMapping,
                alreadyApplied,
            );

            expect(result.preset).not.toContain("updateSchema");
            expect(result.preset).toContain("addNewField");
        });

        it("should handle array format for backwards compatibility", () => {
            // Old format: just an array of applied migrations
            const alreadyApplied = ["addNewField"] as any;

            const result = preselectMigrations(
                "1.0.0",
                "1.2.0",
                versionMapping,
                alreadyApplied,
            );

            expect(result.story).not.toContain("addNewField");
            expect(result.story).toContain("updateSchema");
        });

        it("should handle empty alreadyApplied", () => {
            const result = preselectMigrations(
                "1.0.0",
                "1.2.0",
                versionMapping,
                { story: [], preset: [] },
            );

            expect(result.story.length).toBeGreaterThan(0);
        });
    });

    describe("edge cases", () => {
        it("should handle empty version mapping", () => {
            const result = preselectMigrations("1.0.0", "2.0.0", {});

            expect(result.story).toEqual([]);
            expect(result.preset).toEqual([]);
        });

        it("should return same migrations for story and preset", () => {
            const result = preselectMigrations(
                "1.0.0",
                "1.1.0",
                versionMapping,
            );

            expect(result.story).toEqual(result.preset);
        });

        it("should flatten nested migration arrays", () => {
            const result = preselectMigrations(
                "1.0.0",
                "1.1.0",
                versionMapping,
            );

            // 1.1.0 has ["addNewField", "updateSchema"]
            // Should be flattened, not nested
            expect(result.story).toContain("addNewField");
            expect(result.story).toContain("updateSchema");
            expect(Array.isArray(result.story[0])).toBe(false);
        });
    });
});
