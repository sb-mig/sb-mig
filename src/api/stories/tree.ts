import type { TraverseAndCreate, TreeNode } from "./tree.types.js";

import Logger from "../../utils/logger.js";

import { createStory, updateStory } from "./stories.js";

export const createTree = (stories: any[], storiesToUpdate: string[] = []) => {
    return buildTree(stories, null, storiesToUpdate);
};

const buildTree = (
    nodes: TreeNode[],
    parentId: number | null = null,
    storiesToUpdate: string[] = []
): TreeNode[] => {
    const tree: TreeNode[] = [];

    nodes.forEach((node) => {
        if (node.parent_id === parentId) {
            const children = buildTree(nodes, node.id, storiesToUpdate);

            tree.push({
                action: storiesToUpdate.includes((node as any)?.full_slug)
                    ? "update"
                    : "create",
                id: node.id,
                parent_id: node.parent_id,
                story: node,
                children,
            });
        }
    });

    return tree;
};

export const traverseAndCreate: TraverseAndCreate = (input, config) => {
    const { tree, realParentId, spaceId } = input;
    tree.forEach(async (node) => {
        try {
            const { action, story } = node;
            const { parent, ...content } = story;
            let storyId: number = story.id;
            if (action === "create") {
                const result = await createStory(
                    { ...content, parent_id: realParentId },
                    { ...config, spaceId }
                );
                storyId = result.story.id;
            } else if (action === "update") {
                const result = await updateStory(
                    { ...content, parent_id: realParentId },
                    `${storyId}`,
                    { force_update: true },
                    { ...config, spaceId }
                );
                storyId = result.story.id;
            }

            if (node.children) {
                traverseAndCreate(
                    {
                        tree: node.children,
                        realParentId: storyId,
                        spaceId,
                    },
                    config
                );
            }
        } catch (e) {
            Logger.error("Error happened");
            Logger.error(e);
        }
    });
};
