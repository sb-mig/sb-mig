/**
 * Live API Tests: Components
 *
 * These tests make REAL requests to the Storyblok Management API.
 * They verify that our component-related functions work correctly
 * with the actual storyblok-js-client library.
 *
 * Run with: STORYBLOK_LIVE_TESTS=true yarn test:api-live
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { managementApi } from "../../src/api/managementApi.js";

const {
    getAllComponents,
    getComponent,
    createComponent,
    updateComponent,
    removeComponent,
    getAllComponentsGroups,
} = managementApi.components;

import {
    skipIfNoLiveTests,
    createLiveApiConfig,
    generateTestComponentName,
    createTestComponentSchema,
    cleanupComponent,
    waitForRateLimit,
    assertValidComponent,
} from "./setup.js";

describe("Components API - Live Tests", () => {
    const skipReason = skipIfNoLiveTests();
    let config: RequestBaseConfig;
    const createdComponentIds: number[] = [];

    beforeAll(() => {
        if (!skipReason) {
            config = createLiveApiConfig();
        }
    });

    afterAll(async () => {
        // Cleanup any components created during tests
        if (!skipReason && createdComponentIds.length > 0) {
            for (const id of createdComponentIds) {
                await cleanupComponent(id, config);
                await waitForRateLimit(300);
            }
        }
    });

    beforeEach(async () => {
        if (!skipReason) {
            await waitForRateLimit(300);
        }
    });

    describe("getAllComponents", () => {
        it.skipIf(skipReason)(
            "should fetch all components from the space",
            async () => {
                const components = await getAllComponents(config);

                expect(Array.isArray(components)).toBe(true);
                // Every space has at least some default components
                expect(components.length).toBeGreaterThanOrEqual(0);

                if (components.length > 0) {
                    // Verify structure of first component
                    assertValidComponent(components[0]);
                }
            },
        );

        it.skipIf(skipReason)(
            "should return components with expected properties",
            async () => {
                const components = await getAllComponents(config);

                if (components.length > 0) {
                    const component = components[0];

                    // Check essential properties exist
                    expect(component).toHaveProperty("id");
                    expect(component).toHaveProperty("name");
                    expect(component).toHaveProperty("schema");
                    expect(component).toHaveProperty("display_name");
                    expect(component).toHaveProperty("created_at");
                }
            },
        );
    });

    describe("getComponent", () => {
        it.skipIf(skipReason)(
            "should return false for non-existent component",
            async () => {
                const result = await getComponent(
                    "definitely-does-not-exist-12345",
                    config,
                );

                expect(result).toBe(false);
            },
        );

        it.skipIf(skipReason)(
            "should find existing component by name",
            async () => {
                // First get all components to find one that exists
                const allComponents = await getAllComponents(config);

                if (allComponents.length > 0) {
                    const existingName = allComponents[0].name;
                    const result = await getComponent(existingName, config);

                    expect(Array.isArray(result)).toBe(true);
                    expect((result as any[]).length).toBe(1);
                    expect((result as any[])[0].name).toBe(existingName);
                }
            },
        );
    });

    describe("createComponent / updateComponent / removeComponent", () => {
        it.skipIf(skipReason)(
            "should create, update, and delete a component",
            async () => {
                const componentName = generateTestComponentName("crud");
                const schema = createTestComponentSchema(componentName);

                // CREATE
                // Note: createComponent doesn't return the created component
                // We need to fetch it after creation
                await createComponent(schema as any, false, config);
                await waitForRateLimit(500);

                // VERIFY CREATE - fetch the component
                const createdComponent = await getComponent(
                    componentName,
                    config,
                );
                expect(Array.isArray(createdComponent)).toBe(true);
                expect((createdComponent as any[]).length).toBe(1);

                const componentData = (createdComponent as any[])[0];
                createdComponentIds.push(componentData.id);
                assertValidComponent(componentData);
                expect(componentData.name).toBe(componentName);

                // UPDATE
                const updatedSchema = {
                    ...componentData,
                    display_name: "Updated Display Name",
                };
                await updateComponent(updatedSchema, false, config);
                await waitForRateLimit(500);

                // VERIFY UPDATE
                const updatedComponent = await getComponent(
                    componentName,
                    config,
                );
                expect((updatedComponent as any[])[0].display_name).toBe(
                    "Updated Display Name",
                );

                // DELETE
                await removeComponent(componentData, config);
                await waitForRateLimit(500);

                // VERIFY DELETE
                const deletedComponent = await getComponent(
                    componentName,
                    config,
                );
                expect(deletedComponent).toBe(false);

                // Remove from cleanup list since we already deleted it
                const index = createdComponentIds.indexOf(componentData.id);
                if (index > -1) {
                    createdComponentIds.splice(index, 1);
                }
            },
        );
    });

    describe("getAllComponentsGroups", () => {
        it.skipIf(skipReason)(
            "should fetch all component groups from the space",
            async () => {
                const groups = await getAllComponentsGroups(config);

                expect(Array.isArray(groups)).toBe(true);
                // Groups might be empty if none exist

                if (groups.length > 0) {
                    const group = groups[0];
                    expect(group).toHaveProperty("id");
                    expect(group).toHaveProperty("name");
                    expect(group).toHaveProperty("uuid");
                }
            },
        );
    });

    describe("API Response Structure (Contract Tests)", () => {
        it.skipIf(skipReason)(
            "should return component with all expected fields from storyblok-js-client",
            async () => {
                const components = await getAllComponents(config);

                if (components.length > 0) {
                    const component = components[0];

                    // These are the fields we depend on in our codebase
                    // If storyblok-js-client changes, this test will catch it
                    const expectedFields = [
                        "id",
                        "name",
                        "display_name",
                        "schema",
                        "is_root",
                        "is_nestable",
                        "created_at",
                        "updated_at",
                    ];

                    for (const field of expectedFields) {
                        expect(
                            component,
                            `Missing expected field: ${field}`,
                        ).toHaveProperty(field);
                    }
                }
            },
        );
    });
});
