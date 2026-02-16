/**
 * E2E Tests Setup
 *
 * This module provides utilities for end-to-end testing of CLI commands.
 * These tests run actual CLI commands and verify the results.
 *
 * Environment Variables Required:
 * - STORYBLOK_SPACE_ID: Your Storyblok space ID
 * - STORYBLOK_ACCESS_TOKEN: Personal access token (Management API)
 *
 * Usage:
 *   Run E2E tests: yarn test:e2e
 */

import { execSync, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Check if E2E tests should run
 */
export const shouldRunE2ETests = (): boolean => {
    return process.env.STORYBLOK_E2E_TESTS === "true";
};

/**
 * Skip reason for E2E tests
 */
export const skipIfNoE2ETests = () => {
    if (!shouldRunE2ETests()) {
        return "E2E tests are disabled. Set STORYBLOK_E2E_TESTS=true to enable.";
    }
    if (
        !process.env.STORYBLOK_SPACE_ID ||
        !process.env.STORYBLOK_ACCESS_TOKEN
    ) {
        return "Missing required environment variables for E2E tests.";
    }
    return false;
};

// ============================================================================
// CLI Execution Helpers
// ============================================================================

export interface CLIResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Get path to the CLI entry point
 */
export const getCliPath = (): string => {
    return path.resolve(process.cwd(), "dist/cli/index.js");
};

/**
 * Run CLI command synchronously
 */
export const runCli = (
    args: string[],
    options: { cwd?: string } = {},
): CLIResult => {
    const cliPath = getCliPath();
    const cwd = options.cwd || process.cwd();

    try {
        const stdout = execSync(`node ${cliPath} ${args.join(" ")}`, {
            cwd,
            encoding: "utf8",
            env: {
                ...process.env,
                // Ensure color output is disabled for easier parsing
                FORCE_COLOR: "0",
                NO_COLOR: "1",
            },
            stdio: ["pipe", "pipe", "pipe"],
        });

        return {
            stdout,
            stderr: "",
            exitCode: 0,
        };
    } catch (error: any) {
        return {
            stdout: error.stdout || "",
            stderr: error.stderr || "",
            exitCode: error.status || 1,
        };
    }
};

/**
 * Run CLI command asynchronously (for long-running commands)
 */
export const runCliAsync = (
    args: string[],
    options: { cwd?: string; timeout?: number } = {},
): Promise<CLIResult> => {
    return new Promise((resolve) => {
        const cliPath = getCliPath();
        const cwd = options.cwd || process.cwd();
        const timeout = options.timeout || 30000;

        let stdout = "";
        let stderr = "";

        const child: ChildProcess = spawn("node", [cliPath, ...args], {
            cwd,
            env: {
                ...process.env,
                FORCE_COLOR: "0",
                NO_COLOR: "1",
            },
        });

        const timer = setTimeout(() => {
            child.kill();
            resolve({
                stdout,
                stderr: stderr + "\nCommand timed out",
                exitCode: 124,
            });
        }, timeout);

        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({
                stdout,
                stderr,
                exitCode: code || 0,
            });
        });
    });
};

// ============================================================================
// Test Fixture Helpers
// ============================================================================

/**
 * Create a temporary test directory with storyblok config
 */
export const createTestDirectory = (name: string): string => {
    const testDir = path.join(process.cwd(), ".test-tmp", name);

    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }

    fs.mkdirSync(testDir, { recursive: true });

    // Create minimal package.json to satisfy config resolution
    const packageJson = {
        name: "sb-mig-e2e-fixture",
        private: true,
        type: "module",
    };
    fs.writeFileSync(
        path.join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
    );

    // Create minimal storyblok config
    const configContent = `
export default {
    componentsDirectories: ["components"],
    accessToken: process.env.STORYBLOK_ACCESS_TOKEN,
    spaceId: process.env.STORYBLOK_SPACE_ID,
    migrationConfigExt: "sb.migration.cjs",
};
`;

    fs.writeFileSync(path.join(testDir, "storyblok.config.mjs"), configContent);

    // Create components directory
    fs.mkdirSync(path.join(testDir, "components"), { recursive: true });

    return testDir;
};

/**
 * Cleanup test directory
 */
export const cleanupTestDirectory = (testDir: string): void => {
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
};

/**
 * Create a test component file
 */
export const createTestComponentFile = (
    testDir: string,
    name: string,
    schema: object,
): string => {
    const filePath = path.join(testDir, "components", `${name}.sb.js`);

    const content = `module.exports = ${JSON.stringify(schema, null, 2)};`;

    fs.writeFileSync(filePath, content);

    return filePath;
};

/**
 * Create a test migration file from fixture template
 */
export const createTestMigrationFileFromFixture = (
    testDir: string,
    fileName: string,
    componentName: string,
): string => {
    const fixturePath = path.join(
        process.cwd(),
        "__tests__",
        "fixtures",
        "migrations",
        "status-migration.sb.migration.cjs",
    );
    const fileContent = fs
        .readFileSync(fixturePath, "utf8")
        .replaceAll("__COMPONENT_NAME__", componentName);
    const filePath = path.join(
        testDir,
        "components",
        `${fileName}.sb.migration.cjs`,
    );

    fs.writeFileSync(filePath, fileContent);

    return filePath;
};

// ============================================================================
// Output Parsing Helpers
// ============================================================================

/**
 * Check if output contains success message
 */
export const hasSuccessMessage = (output: string): boolean => {
    return (
        output.includes("✓") ||
        output.includes("success") ||
        output.includes("Success") ||
        output.includes("created") ||
        output.includes("updated")
    );
};

/**
 * Check if output contains error message
 */
export const hasErrorMessage = (output: string): boolean => {
    return (
        output.includes("✗") ||
        output.includes("error") ||
        output.includes("Error") ||
        output.includes("failed") ||
        output.includes("Failed")
    );
};

/**
 * Extract component names from discover output
 */
export const extractDiscoveredComponents = (output: string): string[] => {
    const matches = output.match(/[a-z-]+\.sb\.js/g) || [];
    return matches.map((m) => m.replace(".sb.js", ""));
};
