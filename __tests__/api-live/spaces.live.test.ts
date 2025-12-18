/**
 * Live API Tests: Spaces
 *
 * These tests make REAL requests to the Storyblok Management API.
 * They verify that our space-related functions work correctly.
 *
 * Run with: STORYBLOK_LIVE_TESTS=true yarn test:api-live
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

import { managementApi } from "../../src/api/managementApi.js";

const { getSpace, getAllSpaces } = managementApi.spaces;

import {
    skipIfNoLiveTests,
    createLiveApiConfig,
    waitForRateLimit,
} from "./setup.js";

describe("Spaces API - Live Tests", () => {
    const skipReason = skipIfNoLiveTests();
    let config: RequestBaseConfig;

    beforeAll(() => {
        if (!skipReason) {
            config = createLiveApiConfig();
        }
    });

    beforeEach(async () => {
        if (!skipReason) {
            await waitForRateLimit(300);
        }
    });

    describe("getSpace", () => {
        it.skipIf(skipReason)(
            "should fetch the current space details",
            async () => {
                const result = await getSpace(
                    { spaceId: config.spaceId },
                    config,
                );

                expect(result).toBeDefined();
                expect(result.space).toBeDefined();
                expect(result.space.id).toBeDefined();
                expect(result.space.name).toBeDefined();
            },
        );

        it.skipIf(skipReason)(
            "should return space with expected properties",
            async () => {
                const result = await getSpace(
                    { spaceId: config.spaceId },
                    config,
                );

                const expectedFields = [
                    "id",
                    "name",
                    "domain",
                    "plan",
                    "plan_level",
                    "created_at",
                ];

                for (const field of expectedFields) {
                    expect(
                        result.space,
                        `Missing expected field: ${field}`,
                    ).toHaveProperty(field);
                }
            },
        );
    });

    describe("getAllSpaces", () => {
        it.skipIf(skipReason)(
            "should fetch all spaces the user has access to",
            async () => {
                // getAllSpaces returns the array directly, not { spaces: [...] }
                const spaces = await getAllSpaces(config);

                expect(spaces).toBeDefined();
                expect(Array.isArray(spaces)).toBe(true);
                // User should have access to at least one space
                expect(spaces.length).toBeGreaterThanOrEqual(1);
            },
        );

        it.skipIf(skipReason)(
            "should include the current test space in the list",
            async () => {
                const spaces = await getAllSpaces(config);

                const testSpace = spaces.find(
                    (space: any) => space.id.toString() === config.spaceId,
                );

                expect(testSpace).toBeDefined();
            },
        );
    });
});
