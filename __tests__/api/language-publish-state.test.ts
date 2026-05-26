import { beforeEach, describe, expect, it, vi } from "vitest";

const { storyblokClientConstructorMock, storyblokGetMock } = vi.hoisted(() => ({
    storyblokClientConstructorMock: vi.fn(),
    storyblokGetMock: vi.fn(),
}));

vi.mock("storyblok-js-client", () => ({
    default: vi.fn().mockImplementation((config, endpoint) => {
        storyblokClientConstructorMock(config, endpoint);

        return {
            get: storyblokGetMock,
        };
    }),
}));

import {
    buildLanguagePublishStateMapFromStories,
    createStatusPreservingFetch,
} from "../../src/api/stories/language-publish-state.js";

const createStoryItem = () => ({
    story: {
        id: "story-1",
        uuid: "uuid-1",
        name: "Contact Us",
        full_slug: "translation-migration-testing/test-1/contact-us",
        is_folder: false,
        published: true,
        unpublished_changes: false,
        published_at: "2026-05-20T10:00:00.000Z",
        first_published_at: "2026-05-20T09:00:00.000Z",
        content: {
            component: "page",
            body: [],
        },
    },
});

describe("buildLanguagePublishStateMapFromStories", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses the Storyblok delivery client instead of raw fetch for translated language checks", async () => {
        const content = {
            component: "page",
            body: [{ component: "target", text: "Published French" }],
        };

        storyblokGetMock.mockResolvedValue({
            data: {
                story: {
                    full_slug:
                        "fr/translation-migration-testing/test-1/contact-us",
                    published_at: "2026-05-20T10:00:00.000Z",
                    content,
                },
            },
        });

        const result = await buildLanguagePublishStateMapFromStories(
            {
                from: "space-1",
                stories: [createStoryItem()],
                languages: ["[default]", "fr"],
                accessToken: "preview-token",
            },
            {
                spaceId: "space-1",
                storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
                rateLimit: 6,
                sbApi: {} as any,
            },
        );

        expect(storyblokClientConstructorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                accessToken: "preview-token",
                rateLimit: 6,
                maxRetries: 10,
                timeout: 60,
                fetch: expect.any(Function),
                cache: {
                    clear: "auto",
                    type: "none",
                },
            }),
            "https://api.storyblok.com/v2",
        );
        expect(storyblokGetMock).toHaveBeenCalledWith(
            "cdn/stories/translation-migration-testing/test-1/contact-us",
            expect.objectContaining({
                version: "published",
                language: "fr",
            }),
        );
        expect(storyblokGetMock).toHaveBeenCalledWith(
            "cdn/stories/translation-migration-testing/test-1/contact-us",
            expect.objectContaining({
                version: "draft",
                language: "fr",
            }),
        );
        expect(result.stories?.[
            "translation-migration-testing/test-1/contact-us"
        ].languages?.fr?.state).toBe("published_clean");
    });

    it("keeps 404 as a valid draft-or-unpublished signal", async () => {
        storyblokGetMock.mockImplementation((_path: string, params: any) => {
            if (params.version === "published") {
                return Promise.reject({
                    status: 404,
                    response: {
                        status: 404,
                        data: ["This record could not be found"],
                    },
                });
            }

            return Promise.resolve({
                data: {
                    story: {
                        full_slug:
                            "fr/translation-migration-testing/test-1/contact-us",
                        published_at: null,
                        content: {
                            component: "page",
                            body: [
                                {
                                    component: "target",
                                    text: "Draft French",
                                },
                            ],
                        },
                    },
                },
            });
        });

        const result = await buildLanguagePublishStateMapFromStories(
            {
                from: "space-1",
                stories: [createStoryItem()],
                languages: ["fr"],
                accessToken: "preview-token",
            },
            {
                spaceId: "space-1",
                storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
                sbApi: {} as any,
            },
        );

        expect(result.stories?.[
            "translation-migration-testing/test-1/contact-us"
        ].languages?.fr?.state).toBe("draft_or_unpublished");
        expect(result.stories?.[
            "translation-migration-testing/test-1/contact-us"
        ].languages?.fr?.published).toMatchObject({
            status: 404,
            errorMessage: "This record could not be found",
        });
    });

    it("maps Storyblok SDK not-found errors without status to draft-or-unpublished", async () => {
        storyblokGetMock.mockImplementation((_path: string, params: any) => {
            if (params.version === "published") {
                return Promise.reject({
                    message: "Not Found",
                });
            }

            return Promise.resolve({
                data: {
                    story: {
                        full_slug:
                            "fr/translation-migration-testing/test-1/contact-us",
                        published_at: null,
                        content: {
                            component: "page",
                            body: [
                                {
                                    component: "target",
                                    text: "Draft French",
                                },
                            ],
                        },
                    },
                },
            });
        });

        const result = await buildLanguagePublishStateMapFromStories(
            {
                from: "space-1",
                stories: [createStoryItem()],
                languages: ["fr"],
                accessToken: "preview-token",
            },
            {
                spaceId: "space-1",
                storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
                sbApi: {} as any,
            },
        );

        expect(result.stories?.[
            "translation-migration-testing/test-1/contact-us"
        ].languages?.fr?.state).toBe("draft_or_unpublished");
        expect(result.stories?.[
            "translation-migration-testing/test-1/contact-us"
        ].languages?.fr?.published).toMatchObject({
            status: 404,
            errorMessage: "Not Found",
        });
    });

    it("does not accept a final 429 as a language publication state", async () => {
        storyblokGetMock.mockRejectedValue({
            status: 429,
            response: { status: 429 },
        });

        await expect(
            buildLanguagePublishStateMapFromStories(
                {
                    from: "space-1",
                    stories: [createStoryItem()],
                    languages: ["fr"],
                    accessToken: "preview-token",
                },
                {
                    spaceId: "space-1",
                    storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
                    sbApi: {} as any,
                },
            ),
        ).rejects.toThrow(
            "Storyblok Delivery API rate limit did not recover after retries",
        );
    });

    it("does not write status 0 into the publish-state map", async () => {
        storyblokGetMock.mockRejectedValue({
            message: "Failed to parse Storyblok response",
        });

        await expect(
            buildLanguagePublishStateMapFromStories(
                {
                    from: "space-1",
                    stories: [createStoryItem()],
                    languages: ["fr"],
                    accessToken: "preview-token",
                },
                {
                    spaceId: "space-1",
                    storyblokDeliveryApiUrl: "https://api.storyblok.com/v2",
                    sbApi: {} as any,
                },
            ),
        ).rejects.toThrow(
            "Storyblok Delivery API request failed without an HTTP status",
        );
    });

    it("preserves HTTP status when Storyblok returns an empty error body", async () => {
        const fetchWithEmptyErrorBody = vi.fn().mockResolvedValue(
            new Response("", {
                status: 404,
                statusText: "Not Found",
                headers: {
                    "content-type": "text/plain",
                },
            }),
        );
        const safeFetch = createStatusPreservingFetch(
            fetchWithEmptyErrorBody as unknown as typeof fetch,
        );

        const response = await safeFetch("https://api.storyblok.com/v2/test");

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({});
    });

    it("preserves HTTP status when Storyblok returns a non-json error body", async () => {
        const fetchWithTextErrorBody = vi.fn().mockResolvedValue(
            new Response("This record could not be found", {
                status: 404,
                statusText: "Not Found",
                headers: {
                    "content-type": "text/plain",
                },
            }),
        );
        const safeFetch = createStatusPreservingFetch(
            fetchWithTextErrorBody as unknown as typeof fetch,
        );

        const response = await safeFetch("https://api.storyblok.com/v2/test");

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: "This record could not be found",
        });
    });
});
