/**
 * E2E Tests: Migrate Content
 *
 * These tests verify the migrate content workflow:
 * 1. Create a component and story in Storyblok
 * 2. Create a migration config
 * 3. Run migrate command
 * 4. Verify story content is updated
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { getComponent } from "../../src/api/components/components.js";
import { managementApi } from "../../src/api/managementApi.js";
import {
    createLiveApiConfig,
    cleanupComponent,
    cleanupStory,
    waitForRateLimit,
    generateTestId,
} from "../api-live/setup.js";

import {
    skipIfNoE2ETests,
    runCliAsync,
    createTestDirectory,
    cleanupTestDirectory,
    createTestMigrationFileFromFixture,
} from "./setup.js";

describe("Migrate Content - E2E Tests", () => {
    const skipReason = skipIfNoE2ETests();
    let testDir: string;
    let config: RequestBaseConfig;
    let componentId: number | undefined;
    let storyId: number | undefined;
    const testId = generateTestId();
    const componentName = `e2e_migrate_${testId}`;
    const storySlug = `e2e-migrate-${testId}`;
    const migrationName = `e2e-migration-${testId}`;

    beforeAll(async () => {
        if (skipReason) {
            return;
        }

        testDir = createTestDirectory(`migrate-test-${testId}`);
        config = createLiveApiConfig();

        await waitForRateLimit(500);

        await managementApi.components.createComponent(
            {
                name: componentName,
                display_name: "E2E Migration Root",
                is_root: true,
                is_nestable: false,
                schema: {
                    status: { type: "text", pos: 0 },
                },
            },
            undefined,
            config,
        );

        await waitForRateLimit(1000);

        const component = await getComponent(componentName, config);
        if (Array.isArray(component) && component[0]?.id) {
            componentId = component[0].id;
        }

        const storyResponse = await managementApi.stories.createStory(
            {
                name: `E2E Migration ${testId}`,
                slug: storySlug,
                content: {
                    component: componentName,
                    status: "before",
                },
            },
            config,
        );

        storyId = storyResponse?.story?.id;

        createTestMigrationFileFromFixture(
            testDir,
            migrationName,
            componentName,
        );
    });

    afterAll(async () => {
        if (skipReason) {
            return;
        }

        if (storyId) {
            await cleanupStory(storyId, config);
            await waitForRateLimit(300);
        }

        if (componentId) {
            await cleanupComponent(componentId, config);
            await waitForRateLimit(300);
        }

        if (testDir) {
            cleanupTestDirectory(testDir);
        }
    });

    beforeEach(async () => {
        if (!skipReason) {
            await waitForRateLimit(500);
        }
    });

    it.skipIf(skipReason)(
        "should migrate story content for a component",
        async () => {
            const result = await runCliAsync(
                [
                    "migrate",
                    "content",
                    "--all",
                    "--from",
                    String(config.spaceId),
                    "--to",
                    String(config.spaceId),
                    "--migration",
                    migrationName,
                    "--withSlug",
                    storySlug,
                    "--yes",
                ],
                { cwd: testDir, timeout: 120000 },
            );

            if (result.stderr) {
                console.log("Migration stderr:", result.stderr);
            }

            expect(result.exitCode).toBe(0);

            await waitForRateLimit(1000);
            const updatedStory = await managementApi.stories.getStoryBySlug(
                storySlug,
                config,
            );

            expect(updatedStory?.story?.content?.status).toBe("after");
        },
    );
});
