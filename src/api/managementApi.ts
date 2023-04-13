import {
    getAllStories,
    getStoryById,
    createStory,
    removeStory,
    updateStory,
} from "./stories.js";

export const managementApi = {
    getAllStories,
    getStory: getStoryById,
    createStory,
    removeStory,
    updateStory,
};
