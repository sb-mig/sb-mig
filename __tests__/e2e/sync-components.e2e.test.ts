/**
 * E2E Tests: Sync Components
 *
 * These tests verify the complete sync components workflow:
 * 1. Discover local components
 * 2. Sync them to Storyblok
 * 3. Verify they exist in the space
 *
 * Run with: STORYBLOK_E2E_TESTS=true yarn test:e2e
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { getComponent } from "../../src/api/components/components.js";
import {
    createLiveApiConfig,
    cleanupComponent,
    waitForRateLimit,
    generateTestId,
} from "../api-live/setup.js";

import {
    skipIfNoE2ETests,
    runCli,
    runCliAsync,
    createTestDirectory,
    cleanupTestDirectory,
    createTestComponentFile,
    hasSuccessMessage,
} from "./setup.js";

describe("Sync Components - E2E Tests", () => {
    const skipReason = skipIfNoE2ETests();
    let testDir: string;
    let config: RequestBaseConfig;
    const createdComponentNames: string[] = [];
    const testId = generateTestId();

    beforeAll(() => {
        if (!skipReason) {
            testDir = createTestDirectory(`sync-test-${testId}`);
            config = createLiveApiConfig();
        }
    });

    afterAll(async () => {
        // Cleanup test directory
        if (!skipReason && testDir) {
            cleanupTestDirectory(testDir);
        }

        // Cleanup any created components
        if (!skipReason && createdComponentNames.length > 0) {
            for (const name of createdComponentNames) {
                const component = await getComponent(name, config);
                if (
                    component &&
                    Array.isArray(component) &&
                    component.length > 0
                ) {
                    await cleanupComponent(component[0].id, config);
                    await waitForRateLimit(300);
                }
            }
        }
    });

    beforeEach(async () => {
        if (!skipReason) {
            await waitForRateLimit(500);
        }
    });

    describe("sync components [component-name]", () => {
        it.skipIf(skipReason)(
            "should sync a single component to Storyblok",
            async () => {
                const componentName = `e2e_test_hero_${testId}`;
                createdComponentNames.push(componentName);

                // Create test component file
                createTestComponentFile(testDir, componentName, {
                    name: componentName,
                    display_name: "E2E Test Hero",
                    is_root: false,
                    is_nestable: true,
                    schema: {
                        title: {
                            type: "text",
                            pos: 0,
                        },
                        subtitle: {
                            type: "text",
                            pos: 1,
                        },
                    },
                });

                // Run sync command
                const result = await runCliAsync(
                    ["sync", "components", componentName],
                    { cwd: testDir, timeout: 60000 },
                );

                console.log("Sync output:", result.stdout);
                if (result.stderr) {
                    console.log("Sync errors:", result.stderr);
                }

                // Verify command succeeded
                expect(result.exitCode).toBe(0);
                expect(hasSuccessMessage(result.stdout)).toBe(true);

                // Verify component exists in Storyblok
                await waitForRateLimit(1000);
                const component = await getComponent(componentName, config);

                expect(Array.isArray(component)).toBe(true);
                expect((component as any[]).length).toBe(1);
                expect((component as any[])[0].name).toBe(componentName);
            },
        );

        it.skipIf(skipReason)(
            "should update an existing component",
            async () => {
                const componentName = `e2e_test_update_${testId}`;
                createdComponentNames.push(componentName);

                // Create initial component
                createTestComponentFile(testDir, componentName, {
                    name: componentName,
                    display_name: "Initial Display Name",
                    is_root: false,
                    is_nestable: true,
                    schema: {
                        title: { type: "text", pos: 0 },
                    },
                });

                // Sync initial version
                await runCliAsync(["sync", "components", componentName], {
                    cwd: testDir,
                    timeout: 60000,
                });
                await waitForRateLimit(1000);

                // Update component file
                createTestComponentFile(testDir, componentName, {
                    name: componentName,
                    display_name: "Updated Display Name",
                    is_root: false,
                    is_nestable: true,
                    schema: {
                        title: { type: "text", pos: 0 },
                        description: { type: "textarea", pos: 1 },
                    },
                });

                // Sync updated version
                const result = await runCliAsync(
                    ["sync", "components", componentName],
                    { cwd: testDir, timeout: 60000 },
                );

                expect(result.exitCode).toBe(0);
                expect(hasSuccessMessage(result.stdout)).toBe(true);

                // Verify update
                await waitForRateLimit(1000);
                const component = await getComponent(componentName, config);

                expect((component as any[])[0].display_name).toBe(
                    "Updated Display Name",
                );
                expect((component as any[])[0].schema).toHaveProperty(
                    "description",
                );
            },
        );
    });

    describe("sync components --all", () => {
        it.skipIf(skipReason)(
            "should sync all components in the directory",
            async () => {
                const component1 = `e2e_all_test1_${testId}`;
                const component2 = `e2e_all_test2_${testId}`;
                createdComponentNames.push(component1, component2);

                // Create multiple test components
                createTestComponentFile(testDir, component1, {
                    name: component1,
                    display_name: "All Test 1",
                    is_root: false,
                    is_nestable: true,
                    schema: { title: { type: "text", pos: 0 } },
                });

                createTestComponentFile(testDir, component2, {
                    name: component2,
                    display_name: "All Test 2",
                    is_root: false,
                    is_nestable: true,
                    schema: { title: { type: "text", pos: 0 } },
                });

                // Sync all
                const result = await runCliAsync(
                    ["sync", "components", "--all"],
                    { cwd: testDir, timeout: 120000 },
                );

                console.log("Sync all output:", result.stdout);

                expect(result.exitCode).toBe(0);

                // Verify both components exist
                await waitForRateLimit(1000);
                const comp1 = await getComponent(component1, config);
                const comp2 = await getComponent(component2, config);

                expect(Array.isArray(comp1)).toBe(true);
                expect(Array.isArray(comp2)).toBe(true);
            },
        );
    });
});
