import path from "path";

import { describe, it, expect } from "vitest";

import {
    compare,
    normalizeDiscover,
    filesPattern,
} from "../../src/cli/utils/discover.js";

// Helper to create cross-platform paths
const p = (...segments: string[]) => path.join(...segments);

describe("compare - local vs external component comparison", () => {
    describe("basic comparison", () => {
        it("should return local components unchanged", () => {
            const result = compare({
                local: [
                    p("project", "src", "hero.sb.js"),
                    p("project", "src", "card.sb.js"),
                ],
                external: [],
            });

            expect(result.local).toHaveLength(2);
            expect(result.local.map((l) => l.name)).toContain("hero.sb.js");
            expect(result.local.map((l) => l.name)).toContain("card.sb.js");
        });

        it("should filter external components that exist locally", () => {
            const result = compare({
                local: [p("project", "src", "hero.sb.js")],
                external: [
                    p("project", "node_modules", "pkg", "hero.sb.js"),
                    p("project", "node_modules", "pkg", "footer.sb.js"),
                ],
            });

            // hero.sb.js exists locally, so should be removed from external
            expect(result.external.map((e) => e.name)).not.toContain(
                "hero.sb.js",
            );
            expect(result.external.map((e) => e.name)).toContain(
                "footer.sb.js",
            );
        });

        it("should keep all external when no local overlap", () => {
            const result = compare({
                local: [p("project", "src", "hero.sb.js")],
                external: [
                    p("project", "node_modules", "pkg", "card.sb.js"),
                    p("project", "node_modules", "pkg", "footer.sb.js"),
                ],
            });

            expect(result.external).toHaveLength(2);
        });
    });

    describe("file name extraction", () => {
        it("should extract file name from full path", () => {
            const testPath = p(
                "very",
                "long",
                "path",
                "to",
                "component",
                "hero.sb.js",
            );
            const result = compare({
                local: [testPath],
                external: [],
            });

            expect(result.local[0].name).toBe("hero.sb.js");
            expect(result.local[0].p).toBe(testPath);
        });

        it("should handle paths with multiple segments", () => {
            const testPath = p("C:", "Users", "project", "src", "hero.sb.js");

            const result = compare({
                local: [testPath],
                external: [],
            });

            expect(result.local[0].name).toBe("hero.sb.js");
        });
    });

    describe("nested node_modules filtering", () => {
        it("should filter out deeply nested node_modules (count > 1)", () => {
            const result = compare({
                local: [],
                external: [
                    p("project", "node_modules", "pkg", "hero.sb.js"), // 1 node_modules - OK
                    p(
                        "project",
                        "node_modules",
                        "pkg",
                        "node_modules",
                        "dep",
                        "card.sb.js",
                    ), // 2 node_modules - filtered
                ],
            });

            expect(result.external).toHaveLength(1);
            expect(result.external[0].name).toBe("hero.sb.js");
        });

        it("should allow exactly one node_modules in path", () => {
            const result = compare({
                local: [],
                external: [
                    p(
                        "project",
                        "node_modules",
                        "@scope",
                        "package",
                        "components",
                        "hero.sb.js",
                    ),
                ],
            });

            expect(result.external).toHaveLength(1);
        });
    });

    describe("edge cases", () => {
        it("should handle empty local and external", () => {
            const result = compare({
                local: [],
                external: [],
            });

            expect(result.local).toEqual([]);
            expect(result.external).toEqual([]);
        });

        it("should handle components with same name in different paths", () => {
            const result = compare({
                local: [
                    p("project", "src", "buttons", "hero.sb.js"),
                    p("project", "src", "sections", "hero.sb.js"), // Same name, different path
                ],
                external: [],
            });

            // Both should be included (same name doesn't matter for local)
            expect(result.local).toHaveLength(2);
        });

        it("should handle special characters in component names", () => {
            const result = compare({
                local: [p("project", "src", "my-component.sb.js")],
                external: [
                    p("project", "node_modules", "pkg", "my-component.sb.js"),
                ],
            });

            // Local takes precedence
            expect(result.local).toHaveLength(1);
            expect(result.external).toHaveLength(0);
        });
    });

    describe("local override behavior", () => {
        it("should allow local to override all matching external", () => {
            const result = compare({
                local: [p("project", "src", "hero.sb.js")],
                external: [
                    p("project", "node_modules", "pkg-a", "hero.sb.js"),
                    p("project", "node_modules", "pkg-b", "hero.sb.js"),
                ],
            });

            // Both external hero.sb.js should be filtered out
            expect(result.external).toHaveLength(0);
        });
    });
});

describe("normalizeDiscover - segment normalization", () => {
    it("should return empty string for empty array", () => {
        expect(normalizeDiscover({ segments: [] })).toBe("");
    });

    it("should return single segment as-is", () => {
        expect(normalizeDiscover({ segments: ["src"] })).toBe("src");
    });

    it("should wrap multiple segments in braces", () => {
        expect(normalizeDiscover({ segments: ["src", "storyblok"] })).toBe(
            "{src,storyblok}",
        );
    });

    it("should handle three or more segments", () => {
        expect(
            normalizeDiscover({ segments: ["src", "storyblok", "components"] }),
        ).toBe("{src,storyblok,components}");
    });
});

describe("filesPattern - glob pattern building", () => {
    it("should build pattern for single directory", () => {
        const pattern = filesPattern({
            mainDirectory: "/project",
            componentDirectories: ["src"],
            ext: "sb.js",
        });

        // Normalize for cross-platform
        const normalized = pattern.replace(/\\/g, "/");
        expect(normalized).toContain("/project/src/");
        expect(normalized).toContain("[^_]*.sb.js");
    });

    it("should build pattern for multiple directories", () => {
        const pattern = filesPattern({
            mainDirectory: "/project",
            componentDirectories: ["src", "storyblok"],
            ext: "sb.js",
        });

        const normalized = pattern.replace(/\\/g, "/");
        expect(normalized).toContain("{src,storyblok}");
        expect(normalized).toContain("[^_]*.sb.js");
    });

    it("should exclude files starting with underscore", () => {
        const pattern = filesPattern({
            mainDirectory: "/project",
            componentDirectories: ["src"],
            ext: "sb.js",
        });

        expect(pattern).toContain("[^_]*");
    });

    it("should handle TypeScript extension", () => {
        const pattern = filesPattern({
            mainDirectory: "/project",
            componentDirectories: ["src"],
            ext: "sb.ts",
        });

        expect(pattern).toContain("sb.ts");
    });

    it("should handle datasource extension", () => {
        const pattern = filesPattern({
            mainDirectory: "/project",
            componentDirectories: ["src"],
            ext: "sb.datasource.js",
        });

        expect(pattern).toContain("sb.datasource.js");
    });
});
