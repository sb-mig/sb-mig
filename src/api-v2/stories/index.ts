import type { ApiClient } from "../client.js";
import type { CopyProgress, CopyResult, StoryTreeNode } from "./types.js";
import type { ExtendedISbStoriesParams } from "../../api/stories/stories.types.js";
import type { RequestBaseConfig } from "../../api/utils/request.js";

import {
    getAllStories as apiGetAllStories,
    getStoryById as apiGetStoryById,
    getStoryBySlug as apiGetStoryBySlug,
    createStory as apiCreateStory,
} from "../../api/stories/stories.js";
import { getAllItemsWithPagination } from "../../api/utils/request.js";

/**
 * Convert ApiClient to RequestBaseConfig format used by existing API
 */
function toRequestConfig(
    client: ApiClient,
    spaceId?: string,
): RequestBaseConfig {
    return {
        spaceId: spaceId ?? client.spaceId,
        sbApi: client.sbApi,
        oauthToken: client.config.oauthToken,
        accessToken: client.config.accessToken,
    };
}

/**
 * Build a tree structure from flat story list
 */
function buildTree(stories: any[]): StoryTreeNode[] {
    const storyMap = new Map<number, StoryTreeNode>();

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
    const rootNodes: StoryTreeNode[] = [];

    for (const storyData of stories) {
        const story = storyData.story || storyData;
        const node = storyMap.get(story.id)!;

        if (story.parent_id === null || story.parent_id === 0) {
            rootNodes.push(node);
        } else {
            const parent = storyMap.get(story.parent_id);
            if (parent) {
                parent.children.push(node);
            } else {
                rootNodes.push(node);
            }
        }
    }

    // Sort children
    const sortNodes = (nodes: StoryTreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.is_folder && !b.is_folder) return -1;
            if (!a.is_folder && b.is_folder) return 1;
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
export async function getAllStories(
    client: ApiClient,
    options?: ExtendedISbStoriesParams,
): Promise<any[]> {
    const config = toRequestConfig(client);
    return await apiGetAllStories({ options }, config);
}

/**
 * Get a single story by ID
 */
export async function getStoryById(
    client: ApiClient,
    storyId: number | string,
): Promise<any> {
    const config = toRequestConfig(client);
    return await apiGetStoryById(String(storyId), config);
}

/**
 * Get a story by slug
 */
export async function getStoryBySlug(
    client: ApiClient,
    slug: string,
): Promise<any> {
    const config = toRequestConfig(client);
    return await apiGetStoryBySlug(slug, config);
}

/**
 * Create a story in a space
 */
export async function createStory(
    client: ApiClient,
    content: any,
): Promise<any> {
    const config = toRequestConfig(client);
    return await apiCreateStory(content, config);
}

/**
 * Fetch all stories and build a tree structure
 */
export async function fetchStories(
    client: ApiClient,
    options?: ExtendedISbStoriesParams,
): Promise<{ stories: any[]; tree: StoryTreeNode[]; total: number }> {
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
export async function copyStories(
    sourceClient: ApiClient,
    targetClient: ApiClient,
    options: {
        storyIds: number[];
        destinationParentId?: number | null;
    },
    onProgress?: (progress: CopyProgress) => void,
): Promise<CopyResult> {
    const errors: string[] = [];
    let copiedCount = 0;

    // Fetch all stories with their full content
    const storiesToCopy: any[] = [];
    for (let i = 0; i < options.storyIds.length; i++) {
        const storyId = options.storyIds[i];
        if (storyId === undefined) continue;

        onProgress?.({
            current: i + 1,
            total: options.storyIds.length,
            currentStory: `Fetching story ${storyId}...`,
            status: "copying",
        });

        try {
            const storyData = await getStoryById(sourceClient, storyId);
            storiesToCopy.push(storyData);
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            errors.push(`Failed to fetch story ${storyId}: ${errorMsg}`);
        }
    }

    // Build tree from selected stories
    const tree = buildTree(storiesToCopy);

    // Recursive function to create stories maintaining hierarchy
    const createInOrder = async (
        nodes: StoryTreeNode[],
        newParentId: number | null,
    ): Promise<void> => {
        for (const node of nodes) {
            onProgress?.({
                current: copiedCount + 1,
                total: storiesToCopy.length,
                currentStory: node.name,
                status: "copying",
            });

            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, uuid, created_at, updated_at, ...storyData } =
                    node.story;
                const newStory = await createStory(targetClient, {
                    ...storyData,
                    parent_id: newParentId,
                });

                copiedCount++;

                // Recursively create children
                if (node.children.length > 0) {
                    await createInOrder(node.children, newStory.story.id);
                }
            } catch (error) {
                const errorMsg =
                    error instanceof Error ? error.message : String(error);
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
