import { describe, it, expect } from "vitest";

import {
    configToClient,
    toRequestConfig,
} from "../../src/api-v2/requestConfig.js";
import { createMockApiConfig } from "../mocks/storyblokClient.mock.js";

describe("api-v2/requestConfig", () => {
    describe("configToClient", () => {
        it("reuses the live sbApi instance (does not recreate it)", () => {
            const cfg = createMockApiConfig();

            const client = configToClient(cfg);

            expect(client.sbApi).toBe(cfg.sbApi);
        });

        it("maps spaceId and tokens onto the ApiClient", () => {
            const cfg = createMockApiConfig({
                spaceId: "999",
                oauthToken: "oauth-x",
                accessToken: "access-x",
                rateLimit: 7,
            });

            const client = configToClient(cfg);

            expect(client.spaceId).toBe("999");
            expect(client.config).toEqual({
                oauthToken: "oauth-x",
                spaceId: "999",
                accessToken: "access-x",
                rateLimit: 7,
            });
        });

        it("defaults oauthToken to an empty string when absent", () => {
            const cfg = createMockApiConfig({ oauthToken: undefined });

            const client = configToClient(cfg);

            expect(client.config.oauthToken).toBe("");
        });

        it("applies overrides over the source config", () => {
            const cfg = createMockApiConfig({ spaceId: "1", oauthToken: "a" });

            const client = configToClient(cfg, {
                spaceId: "2",
                oauthToken: "b",
            });

            expect(client.spaceId).toBe("2");
            expect(client.config.spaceId).toBe("2");
            expect(client.config.oauthToken).toBe("b");
        });
    });

    describe("round-trip with toRequestConfig", () => {
        it("preserves the core data-API fields through configToClient → toRequestConfig", () => {
            const cfg = createMockApiConfig({
                spaceId: "555",
                oauthToken: "oauth-rt",
                accessToken: "access-rt",
            });

            const roundTripped = toRequestConfig(configToClient(cfg));

            expect(roundTripped.spaceId).toBe("555");
            expect(roundTripped.sbApi).toBe(cfg.sbApi);
            expect(roundTripped.oauthToken).toBe("oauth-rt");
            expect(roundTripped.accessToken).toBe("access-rt");
        });
    });
});
