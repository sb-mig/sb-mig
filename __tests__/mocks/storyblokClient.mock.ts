import type { RequestBaseConfig } from "../../src/api/utils/request.js";

import { vi } from "vitest";

/**
 * Mock Storyblok API response structure
 */
export interface MockApiResponse<T> {
    data: T;
    total?: number;
    perPage?: number;
}

/**
 * Create a mock Storyblok JS Client with vitest mocks
 */
export function createMockStoryblokClient() {
    return {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    };
}

/**
 * Type for the mock client
 */
export type MockStoryblokClient = ReturnType<typeof createMockStoryblokClient>;

/**
 * Create a mock API config with the mock client
 */
export function createMockApiConfig(
    overrides: Partial<RequestBaseConfig> = {},
): RequestBaseConfig & { sbApi: MockStoryblokClient } {
    return {
        spaceId: "12345",
        sbApi: createMockStoryblokClient() as unknown as RequestBaseConfig["sbApi"],
        oauthToken: "mock-oauth-token",
        accessToken: "mock-access-token",
        storyblokApiUrl: "https://mapi.storyblok.com/v1",
        sbmigWorkingDirectory: "sbmig",
        debug: false,
        rateLimit: 2,
        ...overrides,
    } as RequestBaseConfig & { sbApi: MockStoryblokClient };
}

/**
 * Create a paginated API response mock
 */
export function createPaginatedResponse<T>(
    items: T[],
    itemsKey: string,
    _page = 1,
    perPage = 100,
): MockApiResponse<Record<string, T[]>> {
    return {
        data: {
            [itemsKey]: items,
        },
        total: items.length,
        perPage,
    };
}

/**
 * Mock component data
 */
export function createMockComponent(overrides: Record<string, unknown> = {}) {
    return {
        id: Math.floor(Math.random() * 100000),
        name: "mock-component",
        display_name: "Mock Component",
        is_root: false,
        is_nestable: true,
        component_group_uuid: null,
        schema: {
            title: {
                type: "text",
                pos: 0,
            },
        },
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

/**
 * Mock story data
 */
export function createMockStory(overrides: Record<string, unknown> = {}) {
    return {
        id: Math.floor(Math.random() * 100000),
        name: "Mock Story",
        slug: "mock-story",
        full_slug: "mock-story",
        parent_id: null,
        is_folder: false,
        is_startpage: false,
        position: 0,
        uuid: "mock-uuid-" + Math.random().toString(36).substr(2, 9),
        content: {
            _uid: "content-uid",
            component: "page",
        },
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        published_at: null,
        published: false,
        ...overrides,
    };
}

/**
 * Mock component group data
 */
export function createMockComponentGroup(
    overrides: Record<string, unknown> = {},
) {
    return {
        id: Math.floor(Math.random() * 100000),
        name: "Mock Group",
        uuid: "mock-group-uuid-" + Math.random().toString(36).substr(2, 9),
        ...overrides,
    };
}

/**
 * Mock datasource data
 */
export function createMockDatasource(overrides: Record<string, unknown> = {}) {
    return {
        id: Math.floor(Math.random() * 100000),
        name: "mock-datasource",
        slug: "mock-datasource",
        dimensions: [],
        ...overrides,
    };
}

/**
 * Mock role data
 */
export function createMockRole(overrides: Record<string, unknown> = {}) {
    return {
        id: Math.floor(Math.random() * 100000),
        role: "Mock Role",
        subtitle: "",
        permissions: [],
        allowed_paths: [],
        resolved_allowed_paths: [],
        field_permissions: [],
        ...overrides,
    };
}

/**
 * Setup mock for successful getAllComponents response
 */
export function setupGetAllComponentsMock(
    mockClient: MockStoryblokClient,
    components: ReturnType<typeof createMockComponent>[],
) {
    mockClient.get.mockResolvedValue(
        createPaginatedResponse(components, "components"),
    );
}

/**
 * Setup mock for successful getAllStories response
 */
export function setupGetAllStoriesMock(
    mockClient: MockStoryblokClient,
    stories: ReturnType<typeof createMockStory>[],
) {
    mockClient.get.mockResolvedValue(
        createPaginatedResponse(stories, "stories"),
    );
}

/**
 * Setup mock for successful create/update response
 */
export function setupCreateUpdateMock(
    mockClient: MockStoryblokClient,
    responseData: Record<string, unknown>,
) {
    mockClient.post.mockResolvedValue({ data: responseData });
    mockClient.put.mockResolvedValue({ data: responseData });
}

/**
 * Setup mock for error response
 */
export function setupErrorMock(
    mockClient: MockStoryblokClient,
    method: "get" | "post" | "put" | "delete",
    error: Error,
) {
    mockClient[method].mockRejectedValue(error);
}
