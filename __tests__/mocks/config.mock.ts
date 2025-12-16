import { vi } from "vitest";
import type { IStoryblokConfig } from "../../src/config/config.js";

/**
 * Create a mock configuration object
 */
export function createMockConfig(
    overrides: Partial<IStoryblokConfig> = {}
): IStoryblokConfig {
    return {
        storyblokComponentsLocalDirectory: "src/@storyblok-components",
        sbmigWorkingDirectory: "sbmig",
        presetsBackupDirectory: "component-presets",
        storiesBackupDirectory: "stories",
        componentsDirectories: ["src", "storyblok"],
        awsBucketData: {
            bucketName: "test-bucket",
            s3Url: "s3://test-bucket",
            httpUrl: "https://test-bucket.s3.amazonaws.com",
        },
        metadataSelection: {
            name: true,
            version: true,
        },
        contentHubOriginUrl: "https://test-hub.example.com/api/hub/",
        contentHubAuthorizationToken: "",
        schemaFileExt: "sb.js",
        datasourceExt: "sb.datasource.js",
        rolesExt: "sb.roles.js",
        storiesExt: "sb.stories.json",
        migrationConfigExt: "sb.migration.js",
        storyblokApiUrl: "https://mapi.storyblok.com/v1",
        storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
        storyblokGraphqlApiUrl: "https://gapi.storyblok.com/v1/api",
        oauthToken: "mock-oauth-token",
        openaiToken: "",
        spaceId: "12345",
        accessToken: "mock-access-token",
        boilerplateSpaceId: "172677",
        schemaType: "js",
        flushCache: true,
        cacheDir: ".next/cache",
        debug: false,
        rateLimit: 2,
        ...overrides,
    };
}

/**
 * Mock the config module
 * Use this in tests to replace the global config
 */
export function mockConfigModule(config: Partial<IStoryblokConfig> = {}) {
    const mockConfig = createMockConfig(config);

    vi.mock("../../src/config/config.js", () => ({
        default: mockConfig,
        SCHEMA: {
            JS: "JS",
            TS: "TS",
        },
    }));

    return mockConfig;
}

/**
 * Create environment variables mock
 */
export function createMockEnv(overrides: Record<string, string> = {}) {
    return {
        STORYBLOK_OAUTH_TOKEN: "mock-oauth-token",
        STORYBLOK_SPACE_ID: "12345",
        STORYBLOK_ACCESS_TOKEN: "mock-access-token",
        ...overrides,
    };
}
