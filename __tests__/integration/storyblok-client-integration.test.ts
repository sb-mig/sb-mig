import { describe, it, expect } from "vitest";
import StoryblokClient, { ISbResult, ISbConfig } from "storyblok-js-client";

/**
 * Integration tests for storyblok-js-client v7 migration
 * These tests verify that the client can be initialized and types are correct
 * 
 * Note: These are NOT live API tests - they test initialization and type safety
 */
describe("Storyblok JS Client v7 Integration", () => {
    describe("Client Initialization", () => {
        it("should initialize client with oauth token config", () => {
            const client = new StoryblokClient(
                {
                    oauthToken: "test-oauth-token",
                    rateLimit: 3,
                    cache: {
                        clear: "auto",
                        type: "none",
                    },
                },
                "https://mapi.storyblok.com/v1"
            );

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(StoryblokClient);
        });

        it("should initialize client with access token config", () => {
            const client = new StoryblokClient(
                {
                    accessToken: "test-access-token",
                    rateLimit: 2,
                    cache: {
                        clear: "auto",
                        type: "none",
                    },
                },
                "https://api.storyblok.com/v2"
            );

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(StoryblokClient);
        });

        it("should initialize client with both tokens", () => {
            const client = new StoryblokClient({
                oauthToken: "test-oauth-token",
                accessToken: "test-access-token",
                rateLimit: 5,
                cache: {
                    clear: "manual",
                    type: "memory",
                },
            });

            expect(client).toBeDefined();
        });

        it("should accept all cache configuration options", () => {
            // Test 'none' cache type
            const clientNone = new StoryblokClient({
                accessToken: "test",
                cache: { type: "none", clear: "auto" },
            });
            expect(clientNone).toBeDefined();

            // Test 'memory' cache type
            const clientMemory = new StoryblokClient({
                accessToken: "test",
                cache: { type: "memory", clear: "manual" },
            });
            expect(clientMemory).toBeDefined();

            // Test 'onpreview' clear option
            const clientPreview = new StoryblokClient({
                accessToken: "test",
                cache: { type: "memory", clear: "onpreview" },
            });
            expect(clientPreview).toBeDefined();
        });

        it("should accept custom endpoint URL", () => {
            const customEndpoints = [
                "https://mapi.storyblok.com/v1",
                "https://api.storyblok.com/v2",
                "https://api-us.storyblok.com/v2",
            ];

            customEndpoints.forEach((endpoint) => {
                const client = new StoryblokClient(
                    { accessToken: "test" },
                    endpoint
                );
                expect(client).toBeDefined();
            });
        });
    });

    describe("Type Exports", () => {
        it("should export ISbResult type", () => {
            // This test verifies the type is available at compile time
            const mockResult: ISbResult = {
                data: { stories: [] },
                perPage: 100,
                total: 0,
                headers: new Headers(),
            };

            expect(mockResult).toHaveProperty("data");
            expect(mockResult).toHaveProperty("perPage");
            expect(mockResult).toHaveProperty("total");
        });

        it("should export ISbConfig type", () => {
            // Verify ISbConfig has expected properties
            const config: ISbConfig = {
                accessToken: "test",
                oauthToken: "test",
                rateLimit: 5,
                cache: { type: "none" },
            };

            expect(config.accessToken).toBe("test");
            expect(config.rateLimit).toBe(5);
        });
    });

    describe("Client Methods Existence", () => {
        let client: StoryblokClient;

        beforeAll(() => {
            client = new StoryblokClient({
                accessToken: "test-token",
                cache: { type: "none" },
            });
        });

        it("should have get method", () => {
            expect(typeof client.get).toBe("function");
        });

        it("should have post method", () => {
            expect(typeof client.post).toBe("function");
        });

        it("should have put method", () => {
            expect(typeof client.put).toBe("function");
        });

        it("should have delete method", () => {
            expect(typeof client.delete).toBe("function");
        });
    });

    describe("API Config Pattern (as used in sb-mig)", () => {
        it("should work with the createClient pattern from api-v2/client.ts", () => {
            interface ClientConfig {
                oauthToken: string;
                spaceId: string;
                accessToken?: string;
                rateLimit?: number;
            }

            function createClient(options: ClientConfig) {
                const sbApi = new StoryblokClient(
                    {
                        oauthToken: options.oauthToken,
                        accessToken: options.accessToken,
                        rateLimit: options.rateLimit ?? 3,
                        cache: {
                            clear: "auto",
                            type: "none",
                        },
                    },
                    "https://mapi.storyblok.com/v1"
                );

                return {
                    config: options,
                    sbApi,
                    spaceId: options.spaceId,
                };
            }

            const client = createClient({
                oauthToken: "test-oauth",
                spaceId: "12345",
                rateLimit: 5,
            });

            expect(client.sbApi).toBeInstanceOf(StoryblokClient);
            expect(client.spaceId).toBe("12345");
            expect(client.config.rateLimit).toBe(5);
        });

        it("should work with the global sbApi pattern from cli/api-config.ts", () => {
            const config = {
                accessToken: "preview-token",
                oauthToken: "oauth-token",
                storyblokApiUrl: "https://mapi.storyblok.com/v1",
                rateLimit: 2,
            };

            const globalSbApi = new StoryblokClient(
                {
                    accessToken: config.accessToken,
                    oauthToken: config.oauthToken,
                    rateLimit: config.rateLimit,
                    cache: {
                        clear: "auto",
                        type: "none",
                    },
                },
                config.storyblokApiUrl
            );

            expect(globalSbApi).toBeInstanceOf(StoryblokClient);
        });
    });
});

// Import verification test
describe("Import Verification", () => {
    it("should successfully import default export", async () => {
        const { default: Client } = await import("storyblok-js-client");
        expect(Client).toBeDefined();
        expect(typeof Client).toBe("function");
    });

    it("should successfully import named type exports", async () => {
        // This verifies the types can be imported (compile-time check)
        const mod = await import("storyblok-js-client");
        expect(mod.default).toBeDefined();
    });
});

