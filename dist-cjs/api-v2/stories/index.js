"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllStories = getAllStories;
exports.getStoryById = getStoryById;
exports.getStoryBySlug = getStoryBySlug;
exports.createStory = createStory;
exports.fetchStories = fetchStories;
exports.copyStories = copyStories;
const stories_js_1 = require("../../api/stories/stories.js");
const requestConfig_js_1 = require("../requestConfig.js");
/**
 * Build a tree structure from flat story list
 */
function buildTree(stories) {
    const storyMap = new Map();
    // First pass: create all nodes
    for (const storyData of stories) {
        const story = storyData.story || storyData;
        storyMap.set(story.id, {
            id: story.id,
            name: story.name,
            slug: story.slug,
            full_slug: story.full_slug,
            is_folder: story.is_folder,
            is_startpage: story.is_startpage,
            parent_id: story.parent_id,
            children: [],
            story,
        });
    }
    // Second pass: build tree structure
    const rootNodes = [];
    for (const storyData of stories) {
        const story = storyData.story || storyData;
        const node = storyMap.get(story.id);
        if (story.parent_id === null || story.parent_id === 0) {
            rootNodes.push(node);
        }
        else {
            const parent = storyMap.get(story.parent_id);
            if (parent) {
                parent.children.push(node);
            }
            else {
                rootNodes.push(node);
            }
        }
    }
    // Sort children
    const sortNodes = (nodes) => {
        nodes.sort((a, b) => {
            if (a.is_folder && !b.is_folder)
                return -1;
            if (!a.is_folder && b.is_folder)
                return 1;
            if (a.story.position !== b.story.position) {
                return a.story.position - b.story.position;
            }
            return a.name.localeCompare(b.name);
        });
        for (const node of nodes) {
            if (node.children.length > 0) {
                sortNodes(node.children);
            }
        }
    };
    sortNodes(rootNodes);
    return rootNodes;
}
/**
 * Get all stories from a space
 */
async function getAllStories(client, options) {
    const config = (0, requestConfig_js_1.toRequestConfig)(client);
    return await (0, stories_js_1.getAllStories)({ options }, config);
}
/**
 * Get a single story by ID
 */
async function getStoryById(client, storyId) {
    const config = (0, requestConfig_js_1.toRequestConfig)(client);
    return await (0, stories_js_1.getStoryById)(String(storyId), config);
}
/**
 * Get a story by slug
 */
async function getStoryBySlug(client, slug) {
    const config = (0, requestConfig_js_1.toRequestConfig)(client);
    return await (0, stories_js_1.getStoryBySlug)(slug, config);
}
/**
 * Create a story in a space
 */
async function createStory(client, content) {
    const config = (0, requestConfig_js_1.toRequestConfig)(client);
    return await (0, stories_js_1.createStory)(content, config);
}
/**
 * Fetch all stories and build a tree structure
 */
async function fetchStories(client, options) {
    const stories = await getAllStories(client, options);
    const tree = buildTree(stories);
    return {
        stories,
        tree,
        total: stories.length,
    };
}
/**
 * Copy stories from source space to target space
 */
async function copyStories(sourceClient, targetClient, options, onProgress) {
    const errors = [];
    let copiedCount = 0;
    // Fetch all stories with their full content
    const storiesToCopy = [];
    for (let i = 0; i < options.storyIds.length; i++) {
        const storyId = options.storyIds[i];
        if (storyId === undefined)
            continue;
        onProgress?.({
            current: i + 1,
            total: options.storyIds.length,
            currentStory: `Fetching story ${storyId}...`,
            status: "copying",
        });
        try {
            const storyData = await getStoryById(sourceClient, storyId);
            storiesToCopy.push(storyData);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to fetch story ${storyId}: ${errorMsg}`);
        }
    }
    // Build tree from selected stories
    const tree = buildTree(storiesToCopy);
    // Recursive function to create stories maintaining hierarchy
    const createInOrder = async (nodes, newParentId) => {
        for (const node of nodes) {
            onProgress?.({
                current: copiedCount + 1,
                total: storiesToCopy.length,
                currentStory: node.name,
                status: "copying",
            });
            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, uuid, created_at, updated_at, ...storyData } = node.story;
                const newStory = await createStory(targetClient, {
                    ...storyData,
                    parent_id: newParentId,
                });
                copiedCount++;
                // Recursively create children
                if (node.children.length > 0) {
                    await createInOrder(node.children, newStory.story.id);
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to create "${node.name}": ${errorMsg}`);
            }
        }
    };
    // Start creating from root nodes
    await createInOrder(tree, options.destinationParentId ?? null);
    onProgress?.({
        current: copiedCount,
        total: storiesToCopy.length,
        currentStory: "Complete",
        status: errors.length > 0 ? "error" : "done",
    });
    return {
        success: errors.length === 0,
        copiedCount,
        errors,
    };
}
