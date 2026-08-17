import { describe, it, expect, vi, beforeEach } from "vitest";

const { storyblokClientConstructorMock, customFactoryMock } = vi.hoisted(
    () => ({
        storyblokClientConstructorMock: vi.fn(),
        customFactoryMock: vi.fn(),
    }),
);

vi.mock("storyblok-js-client", () => ({
    default: vi.fn().mockImplementation((config, endpoint) => {
        storyblokClientConstructorMock(config, endpoint);
        return { config, endpoint };
    }),
}));

// Mutable so individual tests can toggle the custom `sbApi` factory.
const mockStoryblokConfig: any = {
    accessToken: "access-token",
    oauthToken: "oauth-token",
    storyblokApiUrl: "https://api.storyblok.com/v1",
    rateLimit: 2,
    spaceId: "1",
    sbApi: undefined,
};

vi.mock("../../src/config/config.js", () => ({
    default: mockStoryblokConfig,
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: { spaceId: "test", sbApi: {}, rateLimit: 2 },
    sbApi: {},
}));

const { buildCopyRateLimitedSbApi } =
    await import("../../src/cli/commands/copy.js");

describe("buildCopyRateLimitedSbApi", () => {
    beforeEach(() => {
        storyblokClientConstructorMock.mockClear();
        customFactoryMock.mockClear();
        mockStoryblokConfig.sbApi = undefined;
    });

    it("constructs a StoryblokClient at the runtime rate, not the config's rateLimit default", () => {
        buildCopyRateLimitedSbApi(12);

        expect(storyblokClientConstructorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                accessToken: "access-token",
                oauthToken: "oauth-token",
                rateLimit: 12,
            }),
            "https://api.storyblok.com/v1",
        );
        // Proof the cap is gone: the constructor call's rateLimit must not
        // fall back to storyblokConfig's own (throttled) default.
        const [config] = storyblokClientConstructorMock.mock.calls[0];
        expect(config.rateLimit).not.toBe(mockStoryblokConfig.rateLimit);
    });

    it("uses a configured custom sbApi factory as-is, ignoring the runtime rate", () => {
        mockStoryblokConfig.sbApi = customFactoryMock.mockReturnValue({
            custom: true,
        });

        const client = buildCopyRateLimitedSbApi(12);

        expect(customFactoryMock).toHaveBeenCalledTimes(1);
        expect(storyblokClientConstructorMock).not.toHaveBeenCalled();
        expect(client).toEqual({ custom: true });
    });
});
