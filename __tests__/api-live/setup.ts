/**
 * API Live Tests Setup
 *
 * This module provides utilities for testing against the real Storyblok API.
 * These tests make actual HTTP requests and require valid credentials.
 *
 * Environment Variables Required:
 * - STORYBLOK_SPACE_ID: Your Storyblok space ID
 * - STORYBLOK_ACCESS_TOKEN: Personal access token (Management API)
 * - STORYBLOK_OAUTH_TOKEN: OAuth token (optional, for OAuth-based auth)
 *
 * Usage:
 *   Run live tests: yarn test:api-live
 *   These tests are skipped by default in regular test runs.
 */

import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import StoryblokClient from "storyblok-js-client";

// ============================================================================
// Environment Configuration
// ============================================================================

export interface LiveTestConfig {
    spaceId: string;
    accessToken: string;
    oauthToken?: string;
    apiUrl: string;
}

/**
 * Check if live API tests should run
 * Tests are skipped unless STORYBLOK_LIVE_TESTS=true
 */
export const shouldRunLiveTests = (): boolean => {
    return process.env.STORYBLOK_LIVE_TESTS === "true";
};

/**
 * Check if required environment variables are set
 */
export const hasRequiredEnvVars = (): boolean => {
    return !!(
        process.env.STORYBLOK_SPACE_ID && process.env.STORYBLOK_ACCESS_TOKEN
    );
};

/**
 * Get live test configuration from environment
 */
export const getLiveTestConfig = (): LiveTestConfig => {
    const spaceId = process.env.STORYBLOK_SPACE_ID;
    const accessToken = process.env.STORYBLOK_ACCESS_TOKEN;
    const oauthToken = process.env.STORYBLOK_OAUTH_TOKEN;
    const apiUrl =
        process.env.STORYBLOK_API_URL || "https://mapi.storyblok.com/v1";

    if (!spaceId || !accessToken) {
        throw new Error(
            "Missing required environment variables: STORYBLOK_SPACE_ID, STORYBLOK_ACCESS_TOKEN",
        );
    }

    return {
        spaceId,
        accessToken,
        oauthToken,
        apiUrl,
    };
};

// ============================================================================
// API Client Factory
// ============================================================================

/**
 * Create a real Storyblok client for live tests
 */
export const createLiveStoryblokClient = (
    config: LiveTestConfig,
): StoryblokClient => {
    return new StoryblokClient(
        {
            accessToken: config.accessToken,
            oauthToken: config.oauthToken,
            rateLimit: 3, // Be gentle with rate limits during tests
            cache: {
                clear: "auto",
                type: "none",
            },
        },
        config.apiUrl,
    );
};

/**
 * Create a complete RequestBaseConfig for live tests
 */
export const createLiveApiConfig = (): RequestBaseConfig => {
    const config = getLiveTestConfig();
    const sbApi = createLiveStoryblokClient(config);

    return {
        spaceId: config.spaceId,
        sbApi,
        accessToken: config.accessToken,
        oauthToken: config.oauthToken,
        storyblokApiUrl: config.apiUrl,
        sbmigWorkingDirectory: ".sbmig-test",
        debug: process.env.STORYBLOK_DEBUG === "true",
        rateLimit: 3,
    };
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
    if (!hasRequiredEnvVars()) {
        return "Missing required environment variables for live tests.";
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
// Cleanup Helpers
// ============================================================================

/**
 * Cleanup helper - delete a component by ID
 */
export const cleanupComponent = async (
    componentId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await config.sbApi.delete(
            `spaces/${config.spaceId}/components/${componentId}`,
            {},
        );
    } catch (error) {
        console.warn(`Failed to cleanup component ${componentId}:`, error);
    }
};

/**
 * Cleanup helper - delete a story by ID
 */
export const cleanupStory = async (
    storyId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await config.sbApi.delete(
            `spaces/${config.spaceId}/stories/${storyId}`,
            {},
        );
    } catch (error) {
        console.warn(`Failed to cleanup story ${storyId}:`, error);
    }
};

/**
 * Cleanup helper - delete a component group by ID
 */
export const cleanupComponentGroup = async (
    groupId: number,
    config: RequestBaseConfig,
): Promise<void> => {
    try {
        await config.sbApi.delete(
            `spaces/${config.spaceId}/component_groups/${groupId}`,
            {},
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
