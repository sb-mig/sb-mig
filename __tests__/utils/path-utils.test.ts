import path from "path";

import { describe, it, expect } from "vitest";

import {
    normalizeDiscover,
    filesPattern,
    compare,
    type CompareResult,
    type OneFileElement,
} from "../../src/utils/path-utils.js";

// Helper to create cross-platform paths
const p = (...segments: string[]) => path.join(...segments);

describe("path-utils", () => {
    describe("normalizeDiscover", () => {
        describe("empty segments", () => {
            it("should return empty string for empty array", () => {
                expect(normalizeDiscover({ segments: [] })).toBe("");
            });
        });

        describe("single segment", () => {
            it("should return segment without braces for single item", () => {
                expect(normalizeDiscover({ segments: ["src"] })).toBe("src");
            });

            it("should handle paths with slashes", () => {
                expect(
                    normalizeDiscover({ segments: ["src/components"] }),
                ).toBe("src/components");
            });

            it("should handle node_modules path", () => {
                expect(
                    normalizeDiscover({
                        segments: ["node_modules/@scope/pkg"],
                    }),
                ).toBe("node_modules/@scope/pkg");
            });
        });

        describe("multiple segments", () => {
            it("should wrap multiple segments in braces with commas", () => {
                expect(normalizeDiscover({ segments: ["src", "lib"] })).toBe(
                    "{src,lib}",
                );
            });

            it("should handle three segments", () => {
                expect(
                    normalizeDiscover({ segments: ["src", "lib", "packages"] }),
                ).toBe("{src,lib,packages}");
            });

            it("should handle paths with mixed formats", () => {
                expect(
                    normalizeDiscover({
                        segments: ["src/components", "node_modules/@scope/pkg"],
                    }),
                ).toBe("{src/components,node_modules/@scope/pkg}");
            });
        });
    });

    describe("filesPattern", () => {
        describe("single directory", () => {
            it("should create pattern for single directory", () => {
                const result = filesPattern({
                    mainDirectory: "/project",
                    componentDirectories: ["src"],
                    ext: "sb.js",
                });

                // Path separators are OS-dependent
                expect(result).toContain("project");
                expect(result).toContain("src");
                expect(result).toContain("**");
                expect(result).toContain("[^_]*.sb.js");
            });

            it("should not include braces for single directory", () => {
                const result = filesPattern({
                    mainDirectory: "/project",
                    componentDirectories: ["components"],
                    ext: "ts",
                });

                expect(result).not.toContain("{");
                expect(result).not.toContain("}");
            });
        });

        describe("multiple directories", () => {
            it("should wrap multiple directories in braces", () => {
                const result = filesPattern({
                    mainDirectory: "/project",
                    componentDirectories: ["src", "lib"],
                    ext: "sb.js",
                });

                expect(result).toContain("{src,lib}");
            });

            it("should handle three directories", () => {
                const result = filesPattern({
                    mainDirectory: "/project",
                    componentDirectories: ["src", "lib", "packages"],
                    ext: "sb.cjs",
                });

                expect(result).toContain("{src,lib,packages}");
                expect(result).toContain("[^_]*.sb.cjs");
            });
        });

        describe("extension handling", () => {
            it("should include the extension in the pattern", () => {
                const result = filesPattern({
                    mainDirectory: "/project",
                    componentDirectories: ["src"],
                    ext: "custom.ext",
                });

                expect(result).toContain("[^_]*.custom.ext");
            });
        });
    });

    describe("compare", () => {
        describe("empty arrays", () => {
            it("should handle empty local and external arrays", () => {
                const result = compare({ local: [], external: [] });

                expect(result.local).toEqual([]);
                expect(result.external).toEqual([]);
            });

            it("should handle empty local with external items", () => {
                const result = compare({
                    local: [],
                    external: [p("node_modules", "pkg", "hero.sb.js")],
                });

                expect(result.local).toEqual([]);
                expect(result.external).toHaveLength(1);
                expect(result.external[0].name).toBe("hero.sb.js");
            });

            it("should handle local items with empty external", () => {
                const result = compare({
                    local: [p("src", "hero.sb.js")],
                    external: [],
                });

                expect(result.local).toHaveLength(1);
                expect(result.local[0].name).toBe("hero.sb.js");
                expect(result.external).toEqual([]);
            });
        });

        describe("path splitting", () => {
            it("should extract filename from path", () => {
                const testPath = p(
                    "project",
                    "src",
                    "components",
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
                const testPath = p("project", "src", "hero.sb.js");
                const result = compare({
                    local: [testPath],
                    external: [],
                });

                expect(result.local[0].name).toBe("hero.sb.js");
            });
        });

        describe("deduplication", () => {
            it("should filter out external items that exist locally", () => {
                const result = compare({
                    local: [p("src", "hero.sb.js")],
                    external: [p("node_modules", "pkg", "hero.sb.js")],
                });

                expect(result.local).toHaveLength(1);
                expect(result.external).toHaveLength(0);
            });

            it("should keep external items that don't exist locally", () => {
                const result = compare({
                    local: [p("src", "hero.sb.js")],
                    external: [p("node_modules", "pkg", "card.sb.js")],
                });

                expect(result.local).toHaveLength(1);
                expect(result.external).toHaveLength(1);
                expect(result.external[0].name).toBe("card.sb.js");
            });

            it("should handle multiple duplicates", () => {
                const result = compare({
                    local: [p("src", "hero.sb.js"), p("src", "card.sb.js")],
                    external: [
                        p("node_modules", "pkg", "hero.sb.js"),
                        p("node_modules", "pkg", "card.sb.js"),
                        p("node_modules", "pkg", "button.sb.js"),
                    ],
                });

                expect(result.local).toHaveLength(2);
                expect(result.external).toHaveLength(1);
                expect(result.external[0].name).toBe("button.sb.js");
            });
        });

        describe("nested node_modules filtering", () => {
            it("should filter out paths with multiple node_modules", () => {
                const result = compare({
                    local: [],
                    external: [
                        p("node_modules", "pkg", "node_modules", "dep", "hero.sb.js"), // nested - should be filtered
                        p("node_modules", "pkg", "card.sb.js"), // single - should remain
                    ],
                });

                expect(result.external).toHaveLength(1);
                expect(result.external[0].name).toBe("card.sb.js");
            });

            it("should keep paths with exactly one node_modules", () => {
                const result = compare({
                    local: [],
                    external: [p("project", "node_modules", "@scope", "pkg", "hero.sb.js")],
                });

                expect(result.external).toHaveLength(1);
            });

            it("should filter deeply nested node_modules", () => {
                const result = compare({
                    local: [],
                    external: [
                        p("node_modules", "a", "node_modules", "b", "node_modules", "c", "file.sb.js"),
                    ],
                });

                expect(result.external).toHaveLength(0);
            });
        });

        describe("combined scenarios", () => {
            it("should handle complex real-world scenario", () => {
                const result = compare({
                    local: [
                        p("project", "src", "hero.sb.js"),
                        p("project", "src", "footer.sb.js"),
                    ],
                    external: [
                        p("project", "node_modules", "@design", "ui", "hero.sb.js"), // duplicate - filtered
                        p("project", "node_modules", "@design", "ui", "button.sb.js"), // unique - kept
                        p("project", "node_modules", "pkg", "node_modules", "dep", "card.sb.js"), // nested - filtered
                    ],
                });

                expect(result.local).toHaveLength(2);
                expect(result.external).toHaveLength(1);
                expect(result.external[0].name).toBe("button.sb.js");
            });
        });

        describe("return type structure", () => {
            it("should return objects with name and p properties", () => {
                const result = compare({
                    local: [p("src", "test.sb.js")],
                    external: [p("node_modules", "pkg", "other.sb.js")],
                });

                // Check local structure
                expect(result.local[0]).toHaveProperty("name");
                expect(result.local[0]).toHaveProperty("p");

                // Check external structure
                expect(result.external[0]).toHaveProperty("name");
                expect(result.external[0]).toHaveProperty("p");
            });
        });
    });
});
