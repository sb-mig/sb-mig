// DELETE
import type {
    GetAllStories,
    GetStoryById,
    RemoveStory,
    CreateStory,
    UpdateStory,
    UpdateStories,
    RemoveAllStories,
    UpsertStory,
    DeepUpsertStory,
    ExtendedISbStoriesParams,
    GetStoryBySlug,
    PublishLanguagesOption,
} from "./stories.types.js";

import chalk from "chalk";

import Logger from "../../utils/logger.js";
import { notNullish } from "../../utils/object-utils.js";
import { getAllItemsWithPagination } from "../utils/request.js";

const resolveStoryLabel = (
    content: Record<string, any> | undefined,
    storyId: string,
): string =>
    content?.full_slug || content?.slug || content?.name || String(storyId);

const DEFAULT_PUBLISH_LANGUAGE = "[default]";

const isDefaultLanguageToken = (language: string): boolean =>
    language.toLowerCase() === "default" ||
    language === DEFAULT_PUBLISH_LANGUAGE;

const normalizePublishLanguageCodes = (languages: string[]): string[] => {
    const normalized = languages.map((language) => {
        const trimmed = language.trim();
        return isDefaultLanguageToken(trimmed)
            ? DEFAULT_PUBLISH_LANGUAGE
            : trimmed;
    });
    const cleanLanguages = normalized.filter((language) => language.length > 0);

    if (cleanLanguages.length === 0) {
        throw new Error("Publish languages cannot be empty.");
    }

    return Array.from(new Set(cleanLanguages));
};

export const parsePublishLanguagesOption = (
    publishLanguages?: string,
): PublishLanguagesOption => {
    if (!publishLanguages) {
        return "default";
    }

    const trimmed = publishLanguages.trim();

    if (trimmed.length === 0) {
        return "default";
    }

    if (trimmed.toLowerCase() === "all") {
        return "all";
    }

    const languages = normalizePublishLanguageCodes(trimmed.split(","));

    if (languages.length === 1 && languages[0] === DEFAULT_PUBLISH_LANGUAGE) {
        return "default";
    }

    return languages;
};

const readSpaceLanguageCodes = (spaceResponse: any): string[] => {
    const space = spaceResponse?.data?.space || spaceResponse?.space || {};
    const languageSources = [
        space.languages,
        space.language_codes,
        space.options?.languages,
    ];

    for (const source of languageSources) {
        if (!Array.isArray(source)) {
            continue;
        }

        return source
            .map((language) => {
                if (typeof language === "string") {
                    return language;
                }

                if (typeof language?.code === "string") {
                    return language.code;
                }

                return "";
            })
            .filter((language) => language.trim().length > 0);
    }

    return [];
};

export const resolvePublishLanguageCodes = async (
    publishLanguages: PublishLanguagesOption | undefined,
    config: { spaceId: string; sbApi: any },
): Promise<string[]> => {
    if (!publishLanguages || publishLanguages === "default") {
        return [DEFAULT_PUBLISH_LANGUAGE];
    }

    if (Array.isArray(publishLanguages)) {
        return normalizePublishLanguageCodes(publishLanguages);
    }

    const spaceResponse = await config.sbApi.get(`spaces/${config.spaceId}`);
    const spaceLanguageCodes = readSpaceLanguageCodes(spaceResponse);

    return normalizePublishLanguageCodes([
        DEFAULT_PUBLISH_LANGUAGE,
        ...spaceLanguageCodes,
    ]);
};

const resolveStoryblokErrorResponse = (err: any): string | undefined => {
    if (typeof err?.response === "string" && err.response.trim().length > 0) {
        return err.response.trim();
    }

    if (
        typeof err?.response?.data === "string" &&
        err.response.data.trim().length > 0
    ) {
        return err.response.data.trim();
    }

    if (
        typeof err?.response?.message === "string" &&
        err.response.message.trim().length > 0
    ) {
        return err.response.message.trim();
    }

    if (typeof err?.message === "string" && err.message.trim().length > 0) {
        return err.message.trim();
    }

    return undefined;
};

export const removeStory: RemoveStory = (args, config) => {
    const { storyId } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Removing ${storyId} from ${spaceId}`);
    return sbApi
        .delete(`spaces/${spaceId}/stories/${storyId}`, {})
        .then((res: any) => {
            Logger.success(
                `Successfully removed: ${res.data.story.name} with ${res.data.story.id} id.`,
            );
            return res;
        })
        .catch(() => {
            Logger.error(`Unable to remove: ${storyId}`);
        });
};

export const removeAllStories: RemoveAllStories = async (config) => {
    const { spaceId } = config;
    Logger.warning(
        `Trying to remove all stories from space with spaceId: ${spaceId}`,
    );
    const stories = await getAllStories({}, config);

    const onlyRootStories = (story: any) =>
        story.story.parent_id === 0 || story.story.parent_id === null;

    const allResponses = Promise.all(
        stories
            .filter(onlyRootStories)
            .map(
                async (story: any) =>
                    await removeStory({ storyId: story?.story?.id }, config),
            ),
    );

    return allResponses;
};

// GET
export const getAllStories: GetAllStories = async (args, config) => {
    const { options } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to get all Stories from: ${spaceId}`);

    const params = notNullish<ExtendedISbStoriesParams>({
        with_slug: options?.with_slug,
        starts_with: options?.starts_with,
        language: options?.language,
    });

    console.log("These are params i will use: ");
    console.log(params);

    const allStoriesWithoutContent = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi.get(`spaces/${spaceId}/stories/`, {
                ...params,
                per_page,
                page,
            } as ExtendedISbStoriesParams),
        params: {
            spaceId,
        },
        itemsKey: "stories",
    });

    Logger.success(
        `Successfully pre-fetched ${allStoriesWithoutContent.length} stories.`,
    );

    let heartBeat = 0;

    const allStories = await Promise.all(
        allStoriesWithoutContent.map(async (story: any) => {
            const result = await getStoryById(story.id, config);

            heartBeat++;
            if (
                heartBeat % 10 === 0 ||
                heartBeat === allStoriesWithoutContent.length
            ) {
                Logger.success(
                    `Successfully fetched ${heartBeat} stories with full content.`,
                );
            }

            return result;
        }),
    );

    return allStories;
};

// GET
export const getStoryById: GetStoryById = (storyId, config) => {
    const { spaceId, sbApi, debug } = config;
    if (debug) {
        console.log(
            `Trying to get Story with id: ${storyId} from space: ${spaceId}, to fill content field.`,
        );
    }
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res: any) => {
            if (debug) {
                Logger.success(
                    `Successfuly fetched story with content, with id: ${storyId} from space: ${spaceId}.`,
                );
            }

            return res.data;
        })
        .catch((err: any) => Logger.error(err));
};

export const getStoryBySlug: GetStoryBySlug = async (slug, config) => {
    const { spaceId, sbApi } = config;
    const storiesWithoutContent: any = await sbApi
        .get(`spaces/${spaceId}/stories/`, {
            per_page: 100,
            // @ts-ignore
            with_slug: slug,
        })
        .then((res: any) => res.data.stories)
        .catch((err: any) => console.error(err));

    const storiesWithContent = await Promise.all(
        storiesWithoutContent.map(
            async (story: any) => await getStoryById(story.id, config),
        ),
    );

    return storiesWithContent[0];
};

// CREATE
export const createStory: CreateStory = (content, config) => {
    const { spaceId, sbApi } = config;
    Logger.log(
        `Creating story with name: ${content.name} in space: ${spaceId}`,
    );
    return sbApi
        .post(`spaces/${spaceId}/stories/`, {
            story: content,
            publish: 1,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

// UPDATE
export const updateStory: UpdateStory = (content, storyId, options, config) => {
    const { spaceId, sbApi } = config;
    const storyLabel = resolveStoryLabel(content, storyId);
    Logger.warning("Trying to update Story...");
    Logger.log(
        `Updating story with name: ${content.name} in space: ${spaceId}`,
    );

    // console.log("THis is content to update: ");
    // console.log(JSON.stringify(content, null, 2));

    return sbApi
        .put(`spaces/${spaceId}/stories/${storyId}`, {
            story: content,
            publish: options.publish ? 1 : 0,
            force_update: options.force_update ? 1 : 0,
        })
        .then((res: any) => {
            console.log(`${chalk.green(res.data.story.full_slug)} updated.`);
            return {
                ok: true,
                stage: "update",
                id: res.data.story.id,
                name: res.data.story.name,
                slug: res.data.story.full_slug,
                data: res.data,
            };
        })
        .catch((err: any) => {
            const status = err?.status || err?.response?.status;
            const responseMessage = resolveStoryblokErrorResponse(err);
            const statusLabel = status ? `status ${status}` : "unknown status";
            const responseLabel = responseMessage
                ? ` Response: ${responseMessage}`
                : "";

            Logger.error(
                `Failed to update story '${storyLabel}' in space '${spaceId}' (${statusLabel}).${responseLabel}`,
            );

            return {
                ok: false,
                stage: "update",
                id: storyId,
                name: content?.name,
                slug: content?.full_slug || content?.slug,
                spaceId,
                status,
                response: responseMessage,
                error: err,
            };
        });
};

export const publishStoryLanguages = async (
    {
        storyId,
        story,
        languages,
    }: {
        storyId: string | number;
        story?: Record<string, any>;
        languages: string[];
    },
    config: { spaceId: string; sbApi: any },
) => {
    const { spaceId, sbApi } = config;
    const lang = languages.join(",");
    const storyLabel = resolveStoryLabel(story, String(storyId));

    Logger.log(
        `Publishing story '${storyLabel}' in space '${spaceId}' for languages: ${lang}`,
    );

    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}/publish`, { lang })
        .then((res: any) => {
            const publishedStory = res?.data?.story || story || {};
            Logger.success(
                `Published story '${storyLabel}' for languages: ${lang}`,
            );

            return {
                ok: true,
                stage: "publish",
                id: publishedStory.id || storyId,
                name: publishedStory.name || story?.name,
                slug:
                    publishedStory.full_slug ||
                    publishedStory.slug ||
                    story?.full_slug ||
                    story?.slug,
                spaceId,
                publishLanguages: languages,
                data: res?.data,
            };
        })
        .catch((err: any) => {
            const status = err?.status || err?.response?.status;
            const responseMessage = resolveStoryblokErrorResponse(err);
            const statusLabel = status ? `status ${status}` : "unknown status";
            const responseLabel = responseMessage
                ? ` Response: ${responseMessage}`
                : "";

            Logger.error(
                `Failed to publish story '${storyLabel}' in space '${spaceId}' (${statusLabel}).${responseLabel}`,
            );

            return {
                ok: false,
                stage: "publish",
                id: storyId,
                name: story?.name,
                slug: story?.full_slug || story?.slug,
                spaceId,
                status,
                response: responseMessage,
                publishLanguages: languages,
                error: err,
            };
        });
};

export const updateStories: UpdateStories = async (args, config) => {
    const { stories, options, spaceId } = args;
    const publishLanguages = options.publish
        ? await resolvePublishLanguageCodes(options.publishLanguages, {
              ...config,
              spaceId,
          })
        : undefined;

    return Promise.allSettled(
        // Run through stories, and update the space with migrated version of stories
        stories.map(async (stories: any) => {
            const story = stories.story;
            const updateResult = await updateStory(
                story,
                story.id,
                {
                    publish: options.publish && !publishLanguages,
                },
                { ...config, spaceId },
            );

            if (!options.publish || !publishLanguages || !updateResult?.ok) {
                return updateResult;
            }

            return publishStoryLanguages(
                {
                    storyId: story.id,
                    story,
                    languages: publishLanguages,
                },
                { ...config, spaceId },
            );
        }),
    );
};

export const upsertStory: UpsertStory = async (args, config) => {
    console.log("Modifying story... in space with id:");
    console.log(config.spaceId);
    const { storyId, storySlug, content } = args;

    console.log("This are args passed: ");
    console.log(args);

    if (storyId) {
        // if this exist than we update story with this id
        console.log("You've selected storyid!");
    } else if (storySlug) {
        // if this exist than we update story with this slug (probably when we try to add story from one space to another,
        console.log("You've selected slug!");
        const foundStory = await getStoryBySlug(storySlug, config);
        console.log("This is story");
        console.log(foundStory);

        if (foundStory) {
            // then update the story
        } else {
            const {
                story: { parent_id, id, parent, ...rest },
            } = content;
            console.log("We are going to create story");
            const response = await createStory(rest, config);
            console.log("This is response");
            console.log(response);
        }
    } else {
        // if this exist than we create new story
        console.log("Nothing passed, creating story...");
    }
};

export const deepUpsertStory: DeepUpsertStory = async (args, config) => {
    console.log("Modifying story... in space with id:");
    console.log(config.spaceId);
    const { storyId, storySlug, content } = args;

    console.log("This are args passed: ");
    console.log(args);

    if (storyId) {
        // if this exist than we update story with this id
        console.log("You've selected storyid!");
    } else if (storySlug) {
        // if this exist than we update story with this slug (probably when we try to add story from one space to another,
        console.log("You've selected slug!");
        const slugs = storySlug.split("/");
        console.log(
            "Slugs for which we need to check for existence of stories",
        );
        console.log(slugs);

        // const foundStory = await managementApi.stories.getStoryBySlug(storySlug, config)
        // console.log("This is story")
        // console.log(foundStory)

        // if(foundStory) {
        //     // then update the story
        // } else {
        //     const {story: {parent_id, id, parent,...rest}} = content
        //     console.log("We are going to create story")
        //     const response = await managementApi.stories.createStory(rest, config)
        //     console.log("This is response")
        //     console.log(response)
        // }
    } else {
        // if this exist than we create new story
        console.log("Nothing passed, creating story...");
    }
};
