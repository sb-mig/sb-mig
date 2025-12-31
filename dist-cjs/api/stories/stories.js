"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepUpsertStory = exports.upsertStory = exports.updateStories = exports.updateStory = exports.createStory = exports.getStoryBySlug = exports.getStoryById = exports.getAllStories = exports.removeAllStories = exports.removeStory = void 0;
const chalk_1 = __importDefault(require("chalk"));
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const object_utils_js_1 = require("../../utils/object-utils.js");
const request_js_1 = require("../utils/request.js");
const removeStory = (args, config) => {
    const { storyId } = args;
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Removing ${storyId} from ${spaceId}`);
    return sbApi
        .delete(`spaces/${spaceId}/stories/${storyId}`, {})
        .then((res) => {
        logger_js_1.default.success(`Successfully removed: ${res.data.story.name} with ${res.data.story.id} id.`);
        return res;
    })
        .catch(() => {
        logger_js_1.default.error(`Unable to remove: ${storyId}`);
    });
};
exports.removeStory = removeStory;
const removeAllStories = async (config) => {
    const { spaceId } = config;
    logger_js_1.default.warning(`Trying to remove all stories from space with spaceId: ${spaceId}`);
    const stories = await (0, exports.getAllStories)({}, config);
    const onlyRootStories = (story) => story.story.parent_id === 0 || story.story.parent_id === null;
    const allResponses = Promise.all(stories
        .filter(onlyRootStories)
        .map(async (story) => await (0, exports.removeStory)({ storyId: story?.story?.id }, config)));
    return allResponses;
};
exports.removeAllStories = removeAllStories;
// GET
const getAllStories = async (args, config) => {
    const { options } = args;
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Trying to get all Stories from: ${spaceId}`);
    const params = (0, object_utils_js_1.notNullish)({
        with_slug: options?.with_slug,
        starts_with: options?.starts_with,
        language: options?.language,
    });
    console.log("These are params i will use: ");
    console.log(params);
    const allStoriesWithoutContent = await (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => sbApi.get(`spaces/${spaceId}/stories/`, {
            ...params,
            per_page,
            page,
        }),
        params: {
            spaceId,
        },
        itemsKey: "stories",
    });
    logger_js_1.default.success(`Successfully pre-fetched ${allStoriesWithoutContent.length} stories.`);
    let heartBeat = 0;
    const allStories = await Promise.all(allStoriesWithoutContent.map(async (story) => {
        const result = await (0, exports.getStoryById)(story.id, config);
        heartBeat++;
        if (heartBeat % 10 === 0 ||
            heartBeat === allStoriesWithoutContent.length) {
            logger_js_1.default.success(`Successfully fetched ${heartBeat} stories with full content.`);
        }
        return result;
    }));
    return allStories;
};
exports.getAllStories = getAllStories;
// GET
const getStoryById = (storyId, config) => {
    const { spaceId, sbApi, debug } = config;
    if (debug) {
        console.log(`Trying to get Story with id: ${storyId} from space: ${spaceId}, to fill content field.`);
    }
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res) => {
        if (debug) {
            logger_js_1.default.success(`Successfuly fetched story with content, with id: ${storyId} from space: ${spaceId}.`);
        }
        return res.data;
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.getStoryById = getStoryById;
const getStoryBySlug = async (slug, config) => {
    const { spaceId, sbApi } = config;
    const storiesWithoutContent = await sbApi
        .get(`spaces/${spaceId}/stories/`, {
        per_page: 100,
        // @ts-ignore
        with_slug: slug,
    })
        .then((res) => res.data.stories)
        .catch((err) => console.error(err));
    const storiesWithContent = await Promise.all(storiesWithoutContent.map(async (story) => await (0, exports.getStoryById)(story.id, config)));
    return storiesWithContent[0];
};
exports.getStoryBySlug = getStoryBySlug;
// CREATE
const createStory = (content, config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Creating story with name: ${content.name} in space: ${spaceId}`);
    return sbApi
        .post(`spaces/${spaceId}/stories/`, {
        story: content,
        publish: 1,
    })
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.createStory = createStory;
// UPDATE
const updateStory = (content, storyId, options, config) => {
    const { spaceId, sbApi } = config;
    logger_js_1.default.warning("Trying to update Story...");
    logger_js_1.default.log(`Updating story with name: ${content.name} in space: ${spaceId}`);
    // console.log("THis is content to update: ");
    // console.log(JSON.stringify(content, null, 2));
    return sbApi
        .put(`spaces/${spaceId}/stories/${storyId}`, {
        story: content,
        publish: options.publish ? 1 : 0,
        force_update: options.force_update ? 1 : 0,
    })
        .then((res) => {
        console.log(`${chalk_1.default.green(res.data.story.full_slug)} updated.`);
        return res.data;
    })
        .catch((err) => console.error(err));
};
exports.updateStory = updateStory;
const updateStories = (args, config) => {
    const { stories, options, spaceId } = args;
    return Promise.allSettled(
    // Run through stories, and update the space with migrated version of stories
    stories.map(async (stories) => {
        return (0, exports.updateStory)(stories.story, stories.story.id, { publish: options.publish }, { ...config, spaceId });
    }));
};
exports.updateStories = updateStories;
const upsertStory = async (args, config) => {
    console.log("Modifying story... in space with id:");
    console.log(config.spaceId);
    const { storyId, storySlug, content } = args;
    console.log("This are args passed: ");
    console.log(args);
    if (storyId) {
        // if this exist than we update story with this id
        console.log("You've selected storyid!");
    }
    else if (storySlug) {
        // if this exist than we update story with this slug (probably when we try to add story from one space to another,
        console.log("You've selected slug!");
        const foundStory = await (0, exports.getStoryBySlug)(storySlug, config);
        console.log("This is story");
        console.log(foundStory);
        if (foundStory) {
            // then update the story
        }
        else {
            const { story: { parent_id, id, parent, ...rest }, } = content;
            console.log("We are going to create story");
            const response = await (0, exports.createStory)(rest, config);
            console.log("This is response");
            console.log(response);
        }
    }
    else {
        // if this exist than we create new story
        console.log("Nothing passed, creating story...");
    }
};
exports.upsertStory = upsertStory;
const deepUpsertStory = async (args, config) => {
    console.log("Modifying story... in space with id:");
    console.log(config.spaceId);
    const { storyId, storySlug, content } = args;
    console.log("This are args passed: ");
    console.log(args);
    if (storyId) {
        // if this exist than we update story with this id
        console.log("You've selected storyid!");
    }
    else if (storySlug) {
        // if this exist than we update story with this slug (probably when we try to add story from one space to another,
        console.log("You've selected slug!");
        const slugs = storySlug.split("/");
        console.log("Slugs for which we need to check for existence of stories");
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
    }
    else {
        // if this exist than we create new story
        console.log("Nothing passed, creating story...");
    }
};
exports.deepUpsertStory = deepUpsertStory;
