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
} from "./stories.types.js";
import type { GetStoryBySlug } from "./stories.types.js";

import chalk from "chalk";

import Logger from "../../utils/logger.js";
import { managementApi } from "../managementApi.js";
import { getAllItemsWithPagination } from "../utils/request.js";

export const removeStory: RemoveStory = (args, config) => {
    const { storyId } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Removing ${storyId} from ${spaceId}`);
    return sbApi
        .delete(`spaces/${spaceId}/stories/${storyId}`, {})
        .then((res: any) => {
            Logger.success(
                `Successfully removed: ${res.data.story.name} with ${res.data.story.id} id.`
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
        `Trying to remove all stories from space with spaceId: ${spaceId}`
    );
    const stories = await getAllStories({}, config);

    const onlyRootStories = (story: any) =>
        story.story.parent_id === 0 || story.story.parent_id === null;

    const allResponses = Promise.all(
        stories
            .filter(onlyRootStories)
            .map(
                async (story: any) =>
                    await removeStory({ storyId: story?.story?.id }, config)
            )
    );

    return allResponses;
};

// GET
export const getAllStories: GetAllStories = async (args, config) => {
    const { options } = args;
    const { spaceId, sbApi } = config;
    Logger.log(`Trying to get all Stories from: ${spaceId}`);

    const allStoriesWithoutContent = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi.get(`spaces/${spaceId}/stories/`, {
                per_page,
                page,
                starts_with: options?.starts_with,
            }),
        params: {
            spaceId,
        },
        itemsKey: "stories",
    });

    Logger.success(
        `Successfully pre-fetched ${allStoriesWithoutContent.length} stories.`
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
                    `Successfully fetched ${heartBeat} stories with full content.`
                );
            }

            return result;
        })
    );

    return allStories;
};

// GET
export const getStoryById: GetStoryById = (storyId, config) => {
    const { spaceId, sbApi, debug } = config;
    if (debug) {
        console.log(
            `Trying to get Story with id: ${storyId} from space: ${spaceId}, to fill content field.`
        );
    }
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res: any) => {
            if (debug) {
                Logger.success(
                    `Successfuly fetched story with content, with id: ${storyId} from space: ${spaceId}.`
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
            async (story: any) => await getStoryById(story.id, config)
        )
    );

    return storiesWithContent[0];
};

// CREATE
export const createStory: CreateStory = (content, config) => {
    const { spaceId, sbApi } = config;
    Logger.log(
        `Creating story with name: ${content.name} in space: ${spaceId}`
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
    Logger.warning("Trying to update Story...");
    Logger.log(
        `Updating story with name: ${content.name} in space: ${spaceId}`
    );
    return sbApi
        .put(`spaces/${spaceId}/stories/${storyId}`, {
            story: content,
            publish: options.publish ? 1 : 0,
        })
        .then((res: any) => {
            console.log(`${chalk.green(res.data.story.full_slug)} updated.`);
            return res.data;
        })
        .catch((err: any) => console.error(err));
};

export const updateStories: UpdateStories = (args, config) => {
    const { stories, options, spaceId } = args;

    return Promise.allSettled(
        // Run through stories, and update the space with migrated version of stories
        stories.map(async (stories: any) => {
            return updateStory(
                stories.story,
                stories.story.id,
                { publish: options.publish },
                { ...config, spaceId }
            );
        })
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
        const foundStory = await managementApi.stories.getStoryBySlug(
            storySlug,
            config
        );
        console.log("This is story");
        console.log(foundStory);

        if (foundStory) {
            // then update the story
        } else {
            const {
                story: { parent_id, id, parent, ...rest },
            } = content;
            console.log("We are going to create story");
            const response = await managementApi.stories.createStory(
                rest,
                config
            );
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
            "Slugs for which we need to check for existence of stories"
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
