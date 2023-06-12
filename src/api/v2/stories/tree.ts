import type { TraverseAndCreate, TreeNode } from "./tree.types.js";

import Logger from "../../../utils/logger.js";

import { createStory } from "./stories.js";

export const createTree = (stories: any[]) => buildTree(stories, null);

const buildTree = (
    nodes: TreeNode[],
    parentId: number | null = null
): TreeNode[] => {
    const tree: TreeNode[] = [];

    nodes.forEach((node) => {
        if (node.parent_id === parentId) {
            const children = buildTree(nodes, node.id);
            tree.push({
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
            const { parent, ...content } = node.story;
            const result = await createStory(
                { ...content, parent_id: realParentId },
                { ...config, spaceId }
            );
            const storyId: number = result.story.id;
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
