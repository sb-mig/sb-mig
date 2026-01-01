import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globSync } from "glob";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Integration tests for glob v11 migration
 * These tests verify that globSync works correctly with our usage patterns
 */
describe("Glob v11 Integration", () => {
    let testDir: string;

    beforeAll(() => {
        // Create a temporary directory structure for testing
        testDir = path.join(os.tmpdir(), `sb-mig-glob-test-${Date.now()}`);
        
        // Create directory structure
        fs.mkdirSync(path.join(testDir, "src/components/hero"), { recursive: true });
        fs.mkdirSync(path.join(testDir, "src/components/card"), { recursive: true });
        fs.mkdirSync(path.join(testDir, "src/storyblok"), { recursive: true });
        fs.mkdirSync(path.join(testDir, "node_modules/@company/ui/src"), { recursive: true });

        // Create test files
        fs.writeFileSync(path.join(testDir, "src/components/hero/hero.sb.js"), "module.exports = {}");
        fs.writeFileSync(path.join(testDir, "src/components/card/card.sb.js"), "module.exports = {}");
        fs.writeFileSync(path.join(testDir, "src/components/_template.sb.js"), "// template");
        fs.writeFileSync(path.join(testDir, "src/storyblok/page.sb.js"), "module.exports = {}");
        fs.writeFileSync(path.join(testDir, "node_modules/@company/ui/src/button.sb.js"), "module.exports = {}");
        
        // Create TypeScript schema files
        fs.writeFileSync(path.join(testDir, "src/components/hero/hero.sb.ts"), "export default {}");
        
        // Create datasource files
        fs.writeFileSync(path.join(testDir, "src/storyblok/icons.sb.datasource.js"), "module.exports = {}");
    });

    afterAll(() => {
        // Cleanup
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe("globSync basic functionality", () => {
        it("should find .sb.js files in directories", () => {
            const pattern = path.join(testDir, "src/components/**/*.sb.js");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            expect(files.length).toBeGreaterThan(0);
            expect(files.some(f => f.includes("hero.sb.js"))).toBe(true);
            expect(files.some(f => f.includes("card.sb.js"))).toBe(true);
        });

        it("should exclude files starting with underscore using pattern", () => {
            const pattern = path.join(testDir, "src/components/**/[^_]*.sb.js");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            // Should find hero and card but NOT _template
            expect(files.some(f => f.includes("hero.sb.js"))).toBe(true);
            expect(files.some(f => f.includes("card.sb.js"))).toBe(true);
            expect(files.some(f => f.includes("_template.sb.js"))).toBe(false);
        });

        it("should work with multiple directory patterns using braces", () => {
            const pattern = path.join(testDir, "{src/components,src/storyblok}/**/*.sb.js");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            expect(files.some(f => f.includes("hero.sb.js"))).toBe(true);
            expect(files.some(f => f.includes("page.sb.js"))).toBe(true);
        });

        it("should find files in node_modules when included in pattern", () => {
            const pattern = path.join(testDir, "node_modules/**/*.sb.js");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            expect(files.length).toBeGreaterThan(0);
            expect(files.some(f => f.includes("button.sb.js"))).toBe(true);
        });

        it("should find TypeScript schema files", () => {
            const pattern = path.join(testDir, "src/**/*.sb.ts");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            expect(files.length).toBeGreaterThan(0);
            expect(files.some(f => f.includes("hero.sb.ts"))).toBe(true);
        });

        it("should find datasource files with specific extension", () => {
            const pattern = path.join(testDir, "src/**/*.sb.datasource.js");
            const files = globSync(pattern.replace(/\\/g, "/"));
            
            expect(files.length).toBe(1);
            expect(files[0]).toContain("icons.sb.datasource.js");
        });
    });

    describe("globSync with follow option", () => {
        it("should accept follow option without errors", () => {
            const pattern = path.join(testDir, "src/**/*.sb.js");
            
            // This should not throw - testing that follow option is still valid in v11
            expect(() => {
                globSync(pattern.replace(/\\/g, "/"), { follow: true });
            }).not.toThrow();
        });

        it("should return same results with follow: true for regular files", () => {
            const pattern = path.join(testDir, "src/**/*.sb.js");
            
            const withoutFollow = globSync(pattern.replace(/\\/g, "/"));
            const withFollow = globSync(pattern.replace(/\\/g, "/"), { follow: true });
            
            expect(withFollow.length).toBe(withoutFollow.length);
        });
    });

    describe("Pattern normalization (Windows compatibility)", () => {
        it("should handle forward slashes consistently", () => {
            const pattern = `${testDir}/src/components/**/*.sb.js`;
            const files = globSync(pattern);
            
            expect(files.length).toBeGreaterThan(0);
        });

        it("should handle pattern with replaced backslashes", () => {
            // This mimics what discover.ts does: pattern.replace(/\\/g, "/")
            const pattern = path.join(testDir, "src", "components", "**", "*.sb.js");
            const normalizedPattern = pattern.replace(/\\/g, "/");
            const files = globSync(normalizedPattern);
            
            expect(files.length).toBeGreaterThan(0);
        });
    });
});

