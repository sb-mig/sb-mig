/**
 * Config System Tests
 *
 * Tests the sb-mig configuration loading chain:
 * - Default config values
 * - Environment variable handling
 * - Config file discovery and merging
 * - Final apiConfig structure
 */

import { describe, it, expect, beforeAll } from "vitest";

// Import the real config modules
import { apiConfig } from "../../src/cli/api-config.js";
import storyblokConfig from "../../src/config/config.js";
import { SCHEMA, storyblokApiMapping } from "../../src/config/constants.js";
import { defaultConfig } from "../../src/config/defaultConfig.js";

describe("Config System", () => {
    describe("defaultConfig", () => {
        const mockPkg = () => ({ type: "module" });
        const mockPath = "/test/project";
        const mockEnv = {
            STORYBLOK_SPACE_ID: "test-space-123",
            NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN: "test-token-abc",
            STORYBLOK_OAUTH_TOKEN: "test-oauth",
        };

        it("should return config with all required properties", () => {
            const config = defaultConfig(mockPkg, mockPath, mockEnv);

            // Core required properties
            expect(config).toHaveProperty("spaceId");
            expect(config).toHaveProperty("accessToken");
            expect(config).toHaveProperty("storyblokApiUrl");
            expect(config).toHaveProperty("componentsDirectories");
            expect(config).toHaveProperty("sbmigWorkingDirectory");
        });

        it("should use STORYBLOK_SPACE_ID from env", () => {
            const config = defaultConfig(mockPkg, mockPath, mockEnv);

            expect(config.spaceId).toBe("test-space-123");
        });

        it("should use NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN from env", () => {
            const config = defaultConfig(mockPkg, mockPath, mockEnv);

            expect(config.accessToken).toBe("test-token-abc");
        });

        it("should fallback to GATSBY_STORYBLOK_ACCESS_TOKEN", () => {
            const envWithGatsby = {
                STORYBLOK_SPACE_ID: "space",
                GATSBY_STORYBLOK_ACCESS_TOKEN: "gatsby-token",
            };
            const config = defaultConfig(mockPkg, mockPath, envWithGatsby);

            expect(config.accessToken).toBe("gatsby-token");
        });

        it("should prefer GATSBY over NEXT_PUBLIC for accessToken", () => {
            const envWithBoth = {
                STORYBLOK_SPACE_ID: "space",
                GATSBY_STORYBLOK_ACCESS_TOKEN: "gatsby-token",
                NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN: "next-token",
            };
            const config = defaultConfig(mockPkg, mockPath, envWithBoth);

            // GATSBY is checked first in the || chain
            expect(config.accessToken).toBe("gatsby-token");
        });

        it("should use correct schema extension for ESM modules", () => {
            const esmPkg = () => ({ type: "module" });
            const config = defaultConfig(esmPkg, mockPath, mockEnv);

            expect(config.schemaFileExt).toBe("sb.js");
            expect(config.datasourceExt).toBe("sb.datasource.js");
            expect(config.rolesExt).toBe("sb.roles.js");
        });

        it("should use correct schema extension for CJS modules", () => {
            const cjsPkg = () => ({ type: "commonjs" });
            const config = defaultConfig(cjsPkg, mockPath, mockEnv);

            expect(config.schemaFileExt).toBe("sb.cjs");
            expect(config.datasourceExt).toBe("sb.datasource.cjs");
            expect(config.rolesExt).toBe("sb.roles.cjs");
        });

        it("should have correct default API URLs", () => {
            const config = defaultConfig(mockPkg, mockPath, {});

            expect(config.storyblokApiUrl).toBe(
                "https://mapi.storyblok.com/v1",
            );
            expect(config.storyblokDeliveryApiUrl).toBe(
                "https://api.storyblok.com/v2",
            );
            expect(config.storyblokGraphqlApiUrl).toBe(
                "https://gapi.storyblok.com/v1/api",
            );
        });

        it("should allow overriding API URLs via env", () => {
            const envWithUrls = {
                NEXT_PUBLIC_STORYBLOK_MANAGEMENT_API_URL:
                    "https://custom-mapi.com",
                NEXT_PUBLIC_STORYBLOK_DELIVERY_API_URL:
                    "https://custom-api.com",
            };
            const config = defaultConfig(mockPkg, mockPath, envWithUrls);

            expect(config.storyblokApiUrl).toBe("https://custom-mapi.com");
            expect(config.storyblokDeliveryApiUrl).toBe(
                "https://custom-api.com",
            );
        });

        it("should have sensible defaults for directories", () => {
            const config = defaultConfig(mockPkg, mockPath, {});

            expect(config.componentsDirectories).toEqual(["src", "storyblok"]);
            expect(config.sbmigWorkingDirectory).toBe("sbmig");
            expect(config.presetsBackupDirectory).toBe("component-presets");
            expect(config.storiesBackupDirectory).toBe("stories");
        });

        it("should have correct default values", () => {
            const config = defaultConfig(mockPkg, mockPath, {});

            expect(config.debug).toBe(false);
            expect(config.flushCache).toBe(true);
            expect(config.rateLimit).toBe(2);
            expect(config.schemaType).toBe(SCHEMA.JS);
        });
    });

    describe("storyblokConfig (merged config)", () => {
        it("should be an object", () => {
            expect(typeof storyblokConfig).toBe("object");
            expect(storyblokConfig).not.toBeNull();
        });

        it("should have required properties", () => {
            expect(storyblokConfig).toHaveProperty("componentsDirectories");
            expect(storyblokConfig).toHaveProperty("storyblokApiUrl");
            expect(storyblokConfig).toHaveProperty("schemaFileExt");
        });

        it("should have componentsDirectories as array", () => {
            expect(Array.isArray(storyblokConfig.componentsDirectories)).toBe(
                true,
            );
            expect(
                storyblokConfig.componentsDirectories.length,
            ).toBeGreaterThan(0);
        });

        it("should merge custom config over defaults", () => {
            // The storyblok.config.mjs in the project has custom componentsDirectories
            // This verifies the merge is working
            expect(storyblokConfig.componentsDirectories).not.toEqual([
                "src",
                "storyblok",
            ]);
        });
    });

    describe("apiConfig", () => {
        it("should be a valid RequestBaseConfig", () => {
            expect(apiConfig).toHaveProperty("spaceId");
            expect(apiConfig).toHaveProperty("sbApi");
        });

        it("should have sbApi as a StoryblokClient instance", () => {
            expect(apiConfig.sbApi).toBeDefined();
            expect(typeof apiConfig.sbApi.get).toBe("function");
            expect(typeof apiConfig.sbApi.post).toBe("function");
            expect(typeof apiConfig.sbApi.put).toBe("function");
            expect(typeof apiConfig.sbApi.delete).toBe("function");
        });

        it("should inherit values from storyblokConfig", () => {
            expect(apiConfig.spaceId).toBe(storyblokConfig.spaceId);
        });
    });

    describe("SCHEMA constants", () => {
        it("should have JS and TS schema types", () => {
            expect(SCHEMA.JS).toBe("js");
            expect(SCHEMA.TS).toBe("ts");
        });
    });

    describe("storyblokApiMapping", () => {
        const regions = ["eu", "us", "cn", "ap"] as const;

        it("should have all regions defined", () => {
            regions.forEach((region) => {
                expect(storyblokApiMapping).toHaveProperty(region);
            });
        });

        it("should have correct EU endpoints", () => {
            expect(storyblokApiMapping.eu.managementApi).toBe(
                "https://mapi.storyblok.com/v1",
            );
            expect(storyblokApiMapping.eu.deliveryApi).toBe(
                "https://api.storyblok.com/v2",
            );
            expect(storyblokApiMapping.eu.graphql).toBe(
                "https://gapi.storyblok.com/v1/api",
            );
        });

        it("should have correct US endpoints", () => {
            expect(storyblokApiMapping.us.managementApi).toBe(
                "https://api-us.storyblok.com/v1",
            );
            expect(storyblokApiMapping.us.deliveryApi).toBe(
                "https://api-us.storyblok.com/v2",
            );
            expect(storyblokApiMapping.us.graphql).toBe(
                "https://gapi-us.storyblok.com/v1/api",
            );
        });

        it("should have correct AP endpoints", () => {
            expect(storyblokApiMapping.ap.managementApi).toBe(
                "https://api-ap.storyblok.com/v1",
            );
            expect(storyblokApiMapping.ap.deliveryApi).toBe(
                "https://api-ap.storyblok.com/v2",
            );
            expect(storyblokApiMapping.ap.graphql).toBe(
                "https://gapi-ap.storyblok.com/v1/api",
            );
        });

        it("should have correct CN endpoints", () => {
            expect(storyblokApiMapping.cn.managementApi).toBe(
                "https://app.storyblokchina.cn",
            );
            expect(storyblokApiMapping.cn.deliveryApi).toBe(
                "https://app.storyblokchina.cn",
            );
            expect(storyblokApiMapping.cn.graphql).toBe("");
        });

        it("should have all endpoints as valid URLs (except CN graphql)", () => {
            regions.forEach((region) => {
                const mapping = storyblokApiMapping[region];
                expect(mapping.managementApi).toMatch(/^https?:\/\//);
                expect(mapping.deliveryApi).toMatch(/^https?:\/\//);
                if (region !== "cn") {
                    expect(mapping.graphql).toMatch(/^https?:\/\//);
                }
            });
        });
    });

    describe("Config with environment variables", () => {
        let originalEnv: NodeJS.ProcessEnv;

        beforeAll(() => {
            originalEnv = { ...process.env };
        });

        it("should have spaceId when STORYBLOK_SPACE_ID is set", () => {
            // This test relies on .env being loaded
            if (process.env.STORYBLOK_SPACE_ID) {
                expect(storyblokConfig.spaceId).toBe(
                    process.env.STORYBLOK_SPACE_ID,
                );
            }
        });

        it("should have accessToken when NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN is set", () => {
            if (process.env.NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN) {
                expect(storyblokConfig.accessToken).toBe(
                    process.env.NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN,
                );
            }
        });
    });
});

describe("Config Type Safety", () => {
    it("should have correct types for all config properties", () => {
        // String properties
        expect(typeof storyblokConfig.storyblokApiUrl).toBe("string");
        expect(typeof storyblokConfig.sbmigWorkingDirectory).toBe("string");

        // Array properties
        expect(Array.isArray(storyblokConfig.componentsDirectories)).toBe(true);

        // Boolean properties
        expect(typeof storyblokConfig.debug).toBe("boolean");
        expect(typeof storyblokConfig.flushCache).toBe("boolean");

        // Number properties
        expect(typeof storyblokConfig.rateLimit).toBe("number");
    });
});
