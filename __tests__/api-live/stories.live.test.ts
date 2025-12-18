/**
 * Live API Tests: Stories
 *
 * These tests make REAL requests to the Storyblok Management API.
 * They verify that our story-related functions work correctly
 * with the actual storyblok-js-client library.
 *
 * Run with: STORYBLOK_LIVE_TESTS=true yarn test:api-live
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { managementApi } from "../../src/api/managementApi.js";

const {
    getAllStories,
    getStoryById,
    getStoryBySlug,
    createStory,
    updateStory,
    removeStory,
} = managementApi.stories;

import {
    skipIfNoLiveTests,
    createLiveApiConfig,
    generateTestStorySlug,
    createTestStoryData,
    cleanupStory,
    waitForRateLimit,
    assertValidStory,
} from "./setup.js";

describe("Stories API - Live Tests", () => {
    const skipReason = skipIfNoLiveTests();
    let config: RequestBaseConfig;
    const createdStoryIds: number[] = [];

    beforeAll(() => {
        if (!skipReason) {
            config = createLiveApiConfig();
        }
    });

    afterAll(async () => {
        // Cleanup any stories created during tests
        if (!skipReason && createdStoryIds.length > 0) {
            for (const id of createdStoryIds) {
                await cleanupStory(id, config);
                await waitForRateLimit(300);
            }
        }
    });

    beforeEach(async () => {
        if (!skipReason) {
            await waitForRateLimit(300);
        }
    });

    describe("getAllStories", () => {
        it.skipIf(skipReason)(
            "should fetch all stories from the space",
            async () => {
                const stories = await getAllStories({}, config);

                expect(Array.isArray(stories)).toBe(true);
                // Stories array might be empty for a new space

                if (stories.length > 0) {
                    // getAllStories returns { story: {...} } wrapped objects
                    const storyWrapper = stories[0];
                    expect(storyWrapper).toHaveProperty("story");
                    assertValidStory(storyWrapper.story);
                }
            },
        );

        it.skipIf(skipReason)(
            "should support filtering with starts_with option",
            async () => {
                // First create a test story with known slug prefix
                const testSlug = generateTestStorySlug("filter-test");
                const storyData = createTestStoryData(testSlug);

                const created = await createStory(storyData as any, config);
                createdStoryIds.push(created.story.id);
                await waitForRateLimit(500);

                // Now filter stories
                const filtered = await getAllStories(
                    {
                        options: {
                            starts_with: "filter-test",
                        },
                    },
                    config,
                );

                expect(Array.isArray(filtered)).toBe(true);
                // Should find at least our test story
                expect(filtered.length).toBeGreaterThanOrEqual(1);
            },
        );
    });

    describe("getStoryById", () => {
        it.skipIf(skipReason)("should fetch a story by its ID", async () => {
            // First create a story to ensure we have one
            const testSlug = generateTestStorySlug("getbyid");
            const storyData = createTestStoryData(testSlug);

            const created = await createStory(storyData as any, config);
            createdStoryIds.push(created.story.id);
            await waitForRateLimit(500);

            // Now fetch by ID
            const fetched = await getStoryById(created.story.id, config);

            expect(fetched).toBeDefined();
            expect(fetched.story).toBeDefined();
            expect(fetched.story.id).toBe(created.story.id);
            expect(fetched.story.slug).toBe(testSlug);
        });
    });

    describe("getStoryBySlug", () => {
        it.skipIf(skipReason)("should fetch a story by its slug", async () => {
            // First create a story to ensure we have one
            const testSlug = generateTestStorySlug("getbyslug");
            const storyData = createTestStoryData(testSlug);

            const created = await createStory(storyData as any, config);
            createdStoryIds.push(created.story.id);
            await waitForRateLimit(500);

            // Now fetch by slug
            const fetched = await getStoryBySlug(testSlug, config);

            expect(fetched).toBeDefined();
            expect(fetched.story).toBeDefined();
            expect(fetched.story.slug).toBe(testSlug);
        });

        it.skipIf(skipReason)(
            "should return undefined for non-existent slug",
            async () => {
                const result = await getStoryBySlug(
                    "definitely-does-not-exist-xyz-12345",
                    config,
                );

                expect(result).toBeUndefined();
            },
        );
    });

    describe("createStory / updateStory / removeStory", () => {
        it.skipIf(skipReason)(
            "should create, update, and delete a story",
            async () => {
                const testSlug = generateTestStorySlug("crud");
                const storyData = createTestStoryData(
                    testSlug,
                    "CRUD Test Story",
                );

                // CREATE
                const created = await createStory(storyData as any, config);
                expect(created).toBeDefined();
                expect(created.story).toBeDefined();
                expect(created.story.id).toBeDefined();
                expect(created.story.slug).toBe(testSlug);
                expect(created.story.name).toBe("CRUD Test Story");

                createdStoryIds.push(created.story.id);
                await waitForRateLimit(500);

                // UPDATE
                const updatedData = {
                    ...created.story,
                    name: "Updated CRUD Test Story",
                };
                const updated = await updateStory(
                    updatedData,
                    `${created.story.id}`,
                    { publish: false, force_update: true },
                    config,
                );

                expect(updated).toBeDefined();
                expect(updated.story.name).toBe("Updated CRUD Test Story");
                await waitForRateLimit(500);

                // DELETE
                const deleted = await removeStory(
                    { storyId: created.story.id },
                    config,
                );
                expect(deleted).toBeDefined();

                // Remove from cleanup list since we deleted it
                const index = createdStoryIds.indexOf(created.story.id);
                if (index > -1) {
                    createdStoryIds.splice(index, 1);
                }
            },
        );
    });

    describe("API Response Structure (Contract Tests)", () => {
        it.skipIf(skipReason)(
            "should return story with all expected fields from storyblok-js-client",
            async () => {
                // Create a story to test structure
                const testSlug = generateTestStorySlug("contract");
                const storyData = createTestStoryData(testSlug);

                const created = await createStory(storyData as any, config);
                createdStoryIds.push(created.story.id);

                // These are the fields we depend on in our codebase
                const expectedFields = [
                    "id",
                    "name",
                    "slug",
                    "full_slug",
                    "uuid",
                    "content",
                    "created_at",
                    "parent_id",
                ];

                for (const field of expectedFields) {
                    expect(
                        created.story,
                        `Missing expected field: ${field}`,
                    ).toHaveProperty(field);
                }
            },
        );
    });
});
