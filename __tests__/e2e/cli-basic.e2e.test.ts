/**
 * E2E Tests: Basic CLI Commands
 *
 * These tests run actual CLI commands and verify they work correctly.
 * They test the fundamental CLI functionality.
 *
 * Run with: STORYBLOK_E2E_TESTS=true yarn test:e2e
 */

import fs from "fs";

import { describe, it, expect, beforeAll } from "vitest";

import { skipIfNoE2ETests, runCli, getCliPath } from "./setup.js";

describe("CLI Basic Commands - E2E Tests", () => {
    const skipReason = skipIfNoE2ETests();

    beforeAll(() => {
        // Ensure CLI is built before running E2E tests
        const cliPath = getCliPath();
        if (!fs.existsSync(cliPath)) {
            throw new Error(
                `CLI not built. Run 'yarn build' first. Expected: ${cliPath}`,
            );
        }
    });

    describe("sb-mig --help", () => {
        it.skipIf(skipReason)("should display help information", async () => {
            const result = runCli(["--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("sb-mig");
            expect(result.stdout).toContain("sync");
            expect(result.stdout).toContain("discover");
        });
    });

    describe("sb-mig --version", () => {
        it.skipIf(skipReason)("should display version number", async () => {
            const result = runCli(["--version"]);

            // Should contain a semver-like version
            expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
        });
    });

    describe("sb-mig discover --help", () => {
        it.skipIf(skipReason)(
            "should display discover command help",
            async () => {
                const result = runCli(["discover", "--help"]);

                expect(result.exitCode).toBe(0);
                expect(result.stdout.toLowerCase()).toContain("discover");
            },
        );
    });

    describe("sb-mig sync --help", () => {
        it.skipIf(skipReason)("should display sync command help", async () => {
            const result = runCli(["sync", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout.toLowerCase()).toContain("sync");
        });
    });
});
