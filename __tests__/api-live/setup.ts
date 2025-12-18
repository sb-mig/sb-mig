/**
 * API Live Tests Setup
 *
 * This module provides utilities for testing against the real Storyblok API.
 * These tests make actual HTTP requests and require valid credentials.
 *
 * IMPORTANT: This uses sb-mig's REAL configuration chain!
 * - Loads storyblok.config.js/.mjs from project root
 * - Merges with defaultConfig
 * - Uses environment variables from .env
 *
 * This means we're testing the full integration:
 * - Config file discovery
 * - Config merging
 * - StoryblokClient creation
 * - API wrapper functions
 *
 * Environment Variables Required (in .env):
 * - STORYBLOK_SPACE_ID: Your Storyblok space ID
 * - STORYBLOK_ACCESS_TOKEN or NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN: Personal access token
 *
 * Usage:
 *   Run live tests: yarn test:api-live
 *   These tests are skipped by default in regular test runs.
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

// Import the REAL apiConfig from sb-mig - this tests the entire config chain!
import { managementApi } from "../../src/api/managementApi.js";
import { apiConfig } from "../../src/cli/api-config.js";

// Import management API using barrel export

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Check if live API tests should run
 * Tests are skipped unless STORYBLOK_LIVE_TESTS=true
 */
export const shouldRunLiveTests = (): boolean => {
    return process.env.STORYBLOK_LIVE_TESTS === "true";
};

/**
 * Check if the real apiConfig has required values
 */
export const hasRequiredConfig = (): boolean => {
    return !!(apiConfig.spaceId && apiConfig.accessToken);
};

/**
 * Get the REAL sb-mig apiConfig
 * This uses the same config chain as the CLI!
 */
export const createLiveApiConfig = (): RequestBaseConfig => {
    return apiConfig;
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Skip test if live tests are not enabled
 */
export const skipIfNoLiveTests = () => {
    if (!shouldRunLiveTests()) {
        return "Live API tests are disabled. Set STORYBLOK_LIVE_TESTS=true to enable.";
    }
    if (!hasRequiredConfig()) {
        return "Missing required config (spaceId or accessToken). Check your storyblok.config.js and .env file.";
    }
    return false;
};

/**
 * Generate a unique test identifier to avoid conflicts
 */
export const generateTestId = (): string => {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Generate a unique component name for testing
 */
export const generateTestComponentName = (prefix = "test"): string => {
    return `${prefix}_component_${generateTestId()}`;
};

/**
 * Generate a unique story slug for testing
 */
export const generateTestStorySlug = (prefix = "test"): string => {
    return `${prefix}-story-${generateTestId()}`;
};

// ============================================================================
// Cleanup Helpers (using managementApi barrel export)
// ============================================================================

/**
 * Cleanup helper - delete a component by ID
 * Uses managementApi.components.removeComponent
 */
export const cleanupComponent = async (
    componentId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await managementApi.components.removeComponent(
            { id: componentId, name: `cleanup-${componentId}` },
            config,
        );
    } catch (error) {
        console.warn(`Failed to cleanup component ${componentId}:`, error);
    }
};

/**
 * Cleanup helper - delete a story by ID
 * Uses managementApi.stories.removeStory
 */
export const cleanupStory = async (
    storyId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await managementApi.stories.removeStory({ storyId: String(storyId) }, config);
    } catch (error) {
        console.warn(`Failed to cleanup story ${storyId}:`, error);
    }
};

/**
 * Cleanup helper - delete a component group by ID
 * Uses managementApi.components.removeComponentGroup
 */
export const cleanupComponentGroup = async (
    groupId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await managementApi.components.removeComponentGroup(
            { id: groupId, name: `cleanup-group-${groupId}` },
            config,
        );
    } catch (error) {
        console.warn(`Failed to cleanup component group ${groupId}:`, error);
    }
};

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Create a minimal component schema for testing
 */
export const createTestComponentSchema = (name: string) => ({
    name,
    display_name: name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
    is_root: false,
    is_nestable: true,
    schema: {
        title: {
            type: "text",
            pos: 0,
        },
    },
});

/**
 * Create a minimal story for testing
 */
export const createTestStoryData = (slug: string, name?: string) => ({
    name:
        name ||
        slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    slug,
    content: {
        component: "page",
        body: [],
    },
});

// ============================================================================
// Assertions Helpers
// ============================================================================

/**
 * Assert that a Storyblok API response has expected structure
 */
export const assertValidComponent = (component: any) => {
    if (!component) throw new Error("Component is undefined");
    if (typeof component.id !== "number")
        throw new Error("Component id is not a number");
    if (typeof component.name !== "string")
        throw new Error("Component name is not a string");
    if (!component.schema) throw new Error("Component schema is missing");
};

/**
 * Assert that a Storyblok story response has expected structure
 */
export const assertValidStory = (story: any) => {
    if (!story) throw new Error("Story is undefined");
    if (typeof story.id !== "number")
        throw new Error("Story id is not a number");
    if (typeof story.name !== "string")
        throw new Error("Story name is not a string");
    if (typeof story.slug !== "string")
        throw new Error("Story slug is not a string");
};

// ============================================================================
// Rate Limiting Helper
// ============================================================================

/**
 * Wait between API calls to respect rate limits
 */
export const waitForRateLimit = (ms = 500): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
