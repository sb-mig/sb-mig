import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
    loggerMock: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: loggerMock,
}));

import {
    parsePublishLanguagesOption,
    resolvePublishLanguageCodes,
    updateStories,
    updateStory,
} from "../../src/api/stories/stories.js";

describe("updateStory", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("saves story updates as drafts by default", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        await updateStory(content, "story-1", { publish: false }, config);

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: content,
                publish: 0,
                force_update: 0,
            },
        );
    });

    it("publishes story updates when requested", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        await updateStory(content, "story-1", { publish: true }, config);

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: content,
                publish: 1,
                force_update: 0,
            },
        );
    });

    it("logs the failing story slug, space, and Storyblok response", async () => {
        const put = vi.fn().mockRejectedValue({
            status: 422,
            response: "The field sb-tab-item.content can't be blank",
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        const result = await updateStory(
            content,
            "story-1",
            { publish: false },
            config,
        );

        expect(put).toHaveBeenCalledOnce();
        expect(loggerMock.error).toHaveBeenCalledWith(
            "Failed to update story 'tours/destinations/japan' in space '291967263583956' (status 422). Response: The field sb-tab-item.content can't be blank",
        );
        expect(result).toMatchObject({
            ok: false,
            id: "story-1",
            name: "Japan",
            slug: "tours/destinations/japan",
            spaceId: "291967263583956",
            status: 422,
            response: "The field sb-tab-item.content can't be blank",
        });
    });
});

describe("updateStories publish languages", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("normalizes explicit publish language options", () => {
        expect(parsePublishLanguagesOption()).toBe("default");
        expect(parsePublishLanguagesOption("all")).toBe("all");
        expect(parsePublishLanguagesOption("default,fr,de,[default]")).toEqual([
            "[default]",
            "fr",
            "de",
        ]);
        expect(() => parsePublishLanguagesOption(",")).toThrow(
            "Publish languages cannot be empty.",
        );
    });

    it("resolves all publish languages from the target Storyblok space", async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                space: {
                    languages: [{ code: "fr" }, { code: "de" }],
                },
            },
        });

        await expect(
            resolvePublishLanguageCodes("all", {
                spaceId: "291967263583956",
                sbApi: { get },
            }),
        ).resolves.toEqual(["[default]", "fr", "de"]);

        expect(get).toHaveBeenCalledWith("spaces/291967263583956");
    });

    it("warns when all publish languages resolves to default only", async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                space: {},
            },
        });

        await expect(
            resolvePublishLanguageCodes("all", {
                spaceId: "291967263583956",
                sbApi: { get },
            }),
        ).resolves.toEqual(["[default]"]);

        expect(loggerMock.warning).toHaveBeenCalledWith(
            "No configured Storyblok languages were found for space '291967263583956'. Publishing only [default].",
        );
    });

    it("preserves legacy updateStories publish behavior without publish languages", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const get = vi.fn();
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
                get,
            },
        } as any;
        const story = {
            story: {
                id: "story-1",
                name: "Japan",
                full_slug: "tours/destinations/japan",
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: { publish: true },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: 1,
                force_update: 0,
            },
        );
        expect(get).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: true,
                stage: "update",
            },
        });
    });

    it("updates a story as draft before publishing default language", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const get = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
                get,
            },
        } as any;
        const story = {
            story: {
                id: "story-1",
                name: "Japan",
                full_slug: "tours/destinations/japan",
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: { publish: true, publishLanguages: "default" },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: 0,
                force_update: 0,
            },
        );
        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default]" },
        );
        expect(put.mock.invocationCallOrder[0]).toBeLessThan(
            get.mock.invocationCallOrder[0],
        );
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: true,
                stage: "publish",
                publishLanguages: ["[default]"],
            },
        });
    });

    it("fetches target-space languages once and publishes them after update", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const get = vi
            .fn()
            .mockResolvedValueOnce({
                data: {
                    space: {
                        languages: [{ code: "fr" }, { code: "de" }],
                    },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    story: {
                        id: "story-1",
                        name: "Japan",
                        full_slug: "tours/destinations/japan",
                    },
                },
            });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
                get,
            },
        } as any;
        const story = {
            story: {
                id: "story-1",
                name: "Japan",
                full_slug: "tours/destinations/japan",
            },
        };

        await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: { publish: true, publishLanguages: "all" },
            },
            config,
        );

        expect(get).toHaveBeenNthCalledWith(1, "spaces/291967263583956");
        expect(get).toHaveBeenNthCalledWith(
            2,
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default],fr,de" },
        );
        expect(put.mock.invocationCallOrder[0]).toBeLessThan(
            get.mock.invocationCallOrder[1],
        );
    });

    it("does not publish when the update fails", async () => {
        const put = vi.fn().mockRejectedValue({
            status: 422,
            response: "invalid story",
        });
        const get = vi.fn();
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
                get,
            },
        } as any;

        const results = await updateStories(
            {
                stories: [
                    {
                        story: {
                            id: "story-1",
                            name: "Japan",
                            full_slug: "tours/destinations/japan",
                        },
                    },
                ],
                spaceId: "291967263583956",
                options: { publish: true, publishLanguages: "default" },
            },
            config,
        );

        expect(get).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: false,
                stage: "update",
                response: "invalid story",
            },
        });
    });
});
