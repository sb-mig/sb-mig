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

// Retries pause for real otherwise (MAR-3405: a story read retries).
vi.mock("../../src/utils/async-utils.js", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    delay: async () => {},
}));

import {
    getAllStories,
    getStoryById,
    parsePublishLanguagesOption,
    publishStoryLanguages,
    resolvePublishLanguageCodes,
    resolveStoryPublishState,
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
                publish: false,
                force_update: false,
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
                publish: true,
                force_update: false,
            },
        );
    });

    it("logs a stable story label for partial update payloads", async () => {
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
            content: {
                component: "page",
            },
        };

        await updateStory(content, "story-1", { force_update: true }, config);

        expect(loggerMock.log).toHaveBeenCalledWith(
            "Updating story 'story-1' in space: 291967263583956",
        );
        expect(loggerMock.log).not.toHaveBeenCalledWith(
            expect.stringContaining("undefined"),
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

describe("getStoryById", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("logs fetch errors with status and Storyblok response instead of object dumps", async () => {
        const get = vi.fn().mockRejectedValue({
            status: 429,
            response: {
                data: ["Too Many Requests"],
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                get,
            },
        } as any;

        // MAR-3405: a 429 is retried, then rejects; it is no longer answered
        // "no such story". The message keeps its shape: status and response.
        await expect(getStoryById("story-1", config)).rejects.toThrow(
            "Failed to fetch story 'story-1' with full content from space '291967263583956' (status 429). Response: Too Many Requests (after 3 attempts)",
        );
        expect(get).toHaveBeenCalledTimes(3);
    });

    it("logs a 404 the same way and answers it with undefined", async () => {
        const get = vi.fn().mockRejectedValue({
            status: 404,
            response: { data: ["Not Found"] },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: { get },
        } as any;

        await expect(getStoryById("story-1", config)).resolves.toBeUndefined();
        expect(loggerMock.error).toHaveBeenCalledWith(
            "Failed to fetch story 'story-1' with full content from space '291967263583956' (status 404). Response: Not Found",
        );
        expect(get).toHaveBeenCalledTimes(1);
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

    it("resolves source story publish states conservatively", () => {
        expect(resolveStoryPublishState({ published: false })).toMatchObject({
            status: "draft",
            shouldPublish: false,
        });
        expect(
            resolveStoryPublishState({
                published: true,
                unpublished_changes: true,
            }),
        ).toMatchObject({
            status: "published_with_unpublished_changes",
            shouldPublish: false,
        });
        expect(resolveStoryPublishState({ published: true })).toMatchObject({
            status: "published_unknown",
            shouldPublish: false,
        });
        expect(
            resolveStoryPublishState({
                published: true,
                unpublished_changes: false,
            }),
        ).toMatchObject({
            status: "published_clean",
            shouldPublish: true,
        });
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
                publish: true,
                force_update: false,
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
                publish: false,
                force_update: false,
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

    it("skips language publishing for draft-only source stories when preserving publish state", async () => {
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
                published: false,
                unpublished_changes: false,
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: "default",
                    preservePublishState: true,
                },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: false,
                force_update: false,
            },
        );
        expect(get).not.toHaveBeenCalled();
        expect(loggerMock.warning).toHaveBeenCalledWith(
            "Skipping publish for story 'tours/destinations/japan' in space '291967263583956' because source story was draft-only.",
        );
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: true,
                stage: "update",
                sourcePublishState: "draft",
                publishSkippedReason: "source_story_draft",
                publishLanguages: ["[default]"],
            },
        });
    });

    it("skips language publishing for published stories with unpublished draft changes", async () => {
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
                published: true,
                unpublished_changes: true,
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: "default",
                    preservePublishState: true,
                },
            },
            config,
        );

        expect(get).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: true,
                stage: "update",
                sourcePublishState: "published_with_unpublished_changes",
                publishSkippedReason: "source_story_has_unpublished_changes",
            },
        });
    });

    it("publishes dirty published stories when collapsing draft state", async () => {
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
                published: true,
                unpublished_changes: true,
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: "default",
                    preservePublishState: true,
                    publishDirtyPublishedStories: true,
                },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: false,
                force_update: false,
            },
        );
        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default]" },
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

    it("publishes dirty translated languages when collapsing draft state", async () => {
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
                published: true,
                unpublished_changes: true,
            },
        };

        await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: ["[default]", "fr", "de"],
                    preservePublishState: true,
                    publishDirtyPublishedStories: true,
                    languagePublishStateMap: {
                        stories: {
                            "tours/destinations/japan": {
                                languages: {
                                    fr: {
                                        state: "published_with_unpublished_changes",
                                    },
                                    de: { state: "draft_or_unpublished" },
                                },
                            },
                        },
                    },
                },
            },
            config,
        );

        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default],fr" },
        );
    });

    it("updates then publishes languages for clean-published source stories", async () => {
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
                published: true,
                unpublished_changes: false,
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: "default",
                    preservePublishState: true,
                },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: false,
                force_update: false,
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

    it("preserves source publish state for legacy publish updates when requested", async () => {
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
        const story = {
            story: {
                id: "story-1",
                name: "Japan",
                full_slug: "tours/destinations/japan",
                published: false,
                unpublished_changes: false,
            },
        };

        await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    preservePublishState: true,
                },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: false,
                force_update: false,
            },
        );
    });

    it("uses language publish-state map for non-default language publishing", async () => {
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
                published: true,
                unpublished_changes: false,
            },
        };

        const results = await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: ["[default]", "fr", "de"],
                    preservePublishState: true,
                    languagePublishStateMap: {
                        stories: {
                            "tours/destinations/japan": {
                                languages: {
                                    fr: { state: "published_clean" },
                                    de: { state: "draft_or_unpublished" },
                                },
                            },
                        },
                    },
                },
            },
            config,
        );

        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default],fr" },
        );
        expect(results[0]).toMatchObject({
            status: "fulfilled",
            value: {
                ok: true,
                stage: "publish",
                publishLanguages: ["[default]", "fr"],
            },
        });
    });

    it("can publish a clean translated language without publishing default draft changes", async () => {
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
                published: true,
                unpublished_changes: true,
            },
        };

        await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: ["[default]", "fr"],
                    preservePublishState: true,
                    languagePublishStateMap: {
                        stories: {
                            "tours/destinations/japan": {
                                languages: {
                                    fr: { state: "published_clean" },
                                },
                            },
                        },
                    },
                },
            },
            config,
        );

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: story.story,
                publish: false,
                force_update: false,
            },
        );
        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "fr" },
        );
    });

    it("falls back to normal publish-state behavior when a language map entry is missing", async () => {
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
                published: true,
                unpublished_changes: false,
            },
        };

        await updateStories(
            {
                stories: [story],
                spaceId: "291967263583956",
                options: {
                    publish: true,
                    publishLanguages: ["[default]", "fr"],
                    preservePublishState: true,
                    languagePublishStateMap: {
                        stories: {},
                    },
                },
            },
            config,
        );

        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1/publish",
            { lang: "[default],fr" },
        );
    });
});

describe("getAllStories", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // MAR-3137 item G. Mutation that must turn it red: drop `with_parent`
    // from the params `getAllStories` builds. Nothing else in the suite
    // notices, and the consequence is every story in the space listed as a
    // root. It also pins that `0` survives the nullish filter on the way.
    it("passes with_parent through to the client, zero included", async () => {
        const get = vi.fn().mockResolvedValue({
            data: { stories: [] },
            total: 0,
            perPage: 100,
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: { get },
        } as any;

        vi.spyOn(console, "log").mockImplementation(() => undefined);

        await getAllStories({ options: { with_parent: 0 } }, config);

        expect(get).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/",
            expect.objectContaining({ with_parent: 0 }),
        );
    });
});

describe("getAllStories: one callback, two stages (MAR-3363 R1)", () => {
    /** 150 stories over two listing pages, then each read with full content. */
    const sbApiOf = () => ({
        get: vi.fn((path: string, params: any) => {
            if (path.endsWith("/stories/")) {
                const page = Number(params?.page ?? 1);
                const count = page === 1 ? 100 : 50;

                return Promise.resolve({
                    data: {
                        stories: Array.from({ length: count }, (_, index) => ({
                            id: (page - 1) * 100 + index + 1,
                        })),
                    },
                    total: 150,
                    perPage: 100,
                });
            }

            const id = Number(path.split("/").pop());

            return Promise.resolve({ data: { story: { id } } });
        }),
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // R1 canary. Mutation that must turn it red: drop `stage` from the page
    // call, so the listing and the content read look the same to a caller.
    it("tells the listing pages from the content reads", async () => {
        const calls: Array<{ stage: string; fetched: number; total: number }> =
            [];

        await getAllStories(
            {
                options: {},
                quiet: true,
                onProgress: (progress) => calls.push(progress),
            },
            { spaceId: "123", sbApi: sbApiOf() as any },
        );

        expect(calls.slice(0, 2)).toEqual([
            { stage: "listing", fetched: 100, total: 150 },
            { stage: "listing", fetched: 150, total: 150 },
        ]);
        expect(calls.slice(2)).toHaveLength(150);
        expect(calls.slice(2).every((call) => call.stage === "content")).toBe(
            true,
        );
        expect(calls.at(-1)).toEqual({
            stage: "content",
            fetched: 150,
            total: 150,
        });
        // Quiet: no listing chatter, no per-10 heartbeat.
        expect(loggerMock.success).not.toHaveBeenCalled();
    });

    it("says its old lines to a caller that asks for no progress", async () => {
        await getAllStories(
            { options: {} },
            { spaceId: "123", sbApi: sbApiOf() as any },
        );

        const lines = loggerMock.success.mock.calls.map((call) =>
            String(call[0]),
        );

        expect(lines).toContain("100 of 150 items fetched.");
        expect(lines).toContain("Successfully pre-fetched 150 stories.");
        expect(lines).toContain(
            "Successfully fetched 150 stories with full content.",
        );
    });
});

describe("publishStoryLanguages: an optional quiet (MAR-3363)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const publish = (
        quiet?: boolean,
        get = vi
            .fn()
            .mockResolvedValue({
                data: { story: { id: 7, full_slug: "blog/a" } },
            }),
    ) =>
        publishStoryLanguages(
            {
                storyId: 7,
                story: { full_slug: "blog/a" },
                languages: ["[default]"],
                ...(quiet === undefined ? {} : { quiet }),
            },
            { spaceId: "123", sbApi: { get } },
        );

    it("says its two lines when the caller passes nothing", async () => {
        await publish();

        expect(loggerMock.log).toHaveBeenCalledTimes(1);
        expect(loggerMock.success).toHaveBeenCalledTimes(1);
    });

    it("says nothing per story when the caller asks for quiet", async () => {
        const result = await publish(true);

        expect(result).toMatchObject({ ok: true, stage: "publish" });
        expect(loggerMock.log).not.toHaveBeenCalled();
        expect(loggerMock.success).not.toHaveBeenCalled();
    });

    it("still names a refused publish when quiet", async () => {
        const result = await publish(
            true,
            vi
                .fn()
                .mockRejectedValue({ status: 422, message: "Unprocessable" }),
        );

        expect(result).toMatchObject({ ok: false, status: 422 });
        expect(loggerMock.error).toHaveBeenCalledTimes(1);
    });
});
