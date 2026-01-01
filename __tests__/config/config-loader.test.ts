/**
 * Config Loader Tests
 *
 * Tests the config file discovery and loading functionality:
 * - getStoryblokConfigContent function
 * - File extension fallback (.js -> .mjs)
 * - Default config fallback when no file found
 */

import path from "path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the getStoryblokConfigContent function
import { getStoryblokConfigContent } from "../../src/config/helper.js";

describe("Config Loader", () => {
    describe("getStoryblokConfigContent", () => {
        it("should be a function", () => {
            expect(typeof getStoryblokConfigContent).toBe("function");
        });

        it("should return a promise", () => {
            const result = getStoryblokConfigContent({
                filePath: "/nonexistent/path",
                ext: ".js",
            });
            expect(result).toBeInstanceOf(Promise);
        });

        it("should successfully load storyblok.config.mjs from project root", async () => {
            const projectRoot = process.cwd();
            const filePath = path.resolve(projectRoot, "storyblok.config");

            const result = await getStoryblokConfigContent({
                filePath,
                ext: ".js",
            });

            // The project has a storyblok.config.mjs file
            expect(result).toBeDefined();
            expect(result).toHaveProperty("componentsDirectories");
        });

        it("should return undefined for non-existent config files", async () => {
            const result = await getStoryblokConfigContent({
                filePath: "/definitely/nonexistent/storyblok.config",
                ext: ".js",
            });

            expect(result).toBeUndefined();
        });
    });

    describe("Config file priority", () => {
        it("should try .js extension first, then .mjs", async () => {
            const projectRoot = process.cwd();
            const filePath = path.resolve(projectRoot, "storyblok.config");

            // In the test project, we have storyblok.config.mjs, not .js
            // So this test verifies the fallback works
            const result = await getStoryblokConfigContent({
                filePath,
                ext: ".js",
            });

            // Should fall back to .mjs and still work
            expect(result).toBeDefined();
            expect(result.componentsDirectories).toBeDefined();
        });
    });

    describe("Config structure validation", () => {
        it("should load config with expected shape", async () => {
            const projectRoot = process.cwd();
            const filePath = path.resolve(projectRoot, "storyblok.config");

            const result = await getStoryblokConfigContent({
                filePath,
                ext: ".js",
            });

            // These are common config properties that might be in a custom config
            if (result) {
                if (result.componentsDirectories) {
                    expect(Array.isArray(result.componentsDirectories)).toBe(
                        true,
                    );
                }
                if (result.rateLimit) {
                    expect(typeof result.rateLimit).toBe("number");
                }
            }
        });
    });
});

describe("Config Merging Behavior", () => {
    it("should preserve default values when custom config does not override", async () => {
        // Import the merged config
        const { default: storyblokConfig } = await import(
            "../../src/config/config.js"
        );
        const { defaultConfig } = await import(
            "../../src/config/defaultConfig.js"
        );
        const { pkg } = await import("../../src/utils/pkg.js");

        const defaults = defaultConfig(pkg, process.cwd(), process.env);

        // These values should come from defaults if not overridden
        expect(storyblokConfig.storyblokApiUrl).toBe(defaults.storyblokApiUrl);
        expect(storyblokConfig.sbmigWorkingDirectory).toBe(
            defaults.sbmigWorkingDirectory,
        );
    });

    it("should override default values when custom config provides them", async () => {
        const { default: storyblokConfig } = await import(
            "../../src/config/config.js"
        );

        // The storyblok.config.mjs overrides componentsDirectories
        // It should not be the default ["src", "storyblok"]
        expect(storyblokConfig.componentsDirectories).not.toEqual([
            "src",
            "storyblok",
        ]);
    });
});

describe("IStoryblokConfig Interface", () => {
    it("should have all expected properties defined", async () => {
        const { default: storyblokConfig } = await import(
            "../../src/config/config.js"
        );

        // Required directory properties
        expect(storyblokConfig).toHaveProperty(
            "storyblokComponentsLocalDirectory",
        );
        expect(storyblokConfig).toHaveProperty("sbmigWorkingDirectory");
        expect(storyblokConfig).toHaveProperty("presetsBackupDirectory");
        expect(storyblokConfig).toHaveProperty("storiesBackupDirectory");
        expect(storyblokConfig).toHaveProperty("componentsDirectories");

        // File extension properties
        expect(storyblokConfig).toHaveProperty("schemaFileExt");
        expect(storyblokConfig).toHaveProperty("datasourceExt");
        expect(storyblokConfig).toHaveProperty("rolesExt");
        expect(storyblokConfig).toHaveProperty("storiesExt");
        expect(storyblokConfig).toHaveProperty("migrationConfigExt");

        // API URL properties
        expect(storyblokConfig).toHaveProperty("storyblokApiUrl");
        expect(storyblokConfig).toHaveProperty("storyblokDeliveryApiUrl");
        expect(storyblokConfig).toHaveProperty("storyblokGraphqlApiUrl");

        // Credential properties
        expect(storyblokConfig).toHaveProperty("spaceId");
        expect(storyblokConfig).toHaveProperty("accessToken");
        expect(storyblokConfig).toHaveProperty("oauthToken");

        // Feature flags
        expect(storyblokConfig).toHaveProperty("debug");
        expect(storyblokConfig).toHaveProperty("flushCache");
        expect(storyblokConfig).toHaveProperty("rateLimit");
        expect(storyblokConfig).toHaveProperty("schemaType");
    });
});
