import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";
import Logger from "../utils/logger.js";

const { spaceId } = storyblokConfig;

// DELETE
export const removeStory = ({
    spaceId,
    storyId,
}: {
    spaceId: string;
    storyId: string;
}) => {
    console.log(`Removing ${storyId} from ${spaceId}`);
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

// GET
export const getAllStories = async ({ spaceId }: { spaceId: string }) => {
    console.log("Trying to get all Stories from: .", spaceId);

    const allStoriesWithoutContent: any = await sbApi
        .get(`spaces/${spaceId}/stories/`, {
            per_page: 100,
        })
        .then((res: any) => res.data.stories)
        .catch((err: any) => console.error(err));

    const allStories = await Promise.all(
        allStoriesWithoutContent.map(
            async (story: any) => await getStory({ spaceId, storyId: story.id })
        )
    );

    return allStories;
};

export const getStory = ({
    spaceId,
    storyId,
}: {
    spaceId: string;
    storyId: string;
}) => {
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

// CREATE
export const createStory = ({
    spaceId,
    content,
}: {
    spaceId: string;
    content: any;
}) => {
    console.log(
        "Moving story with name: ",
        content.name,
        "to space: ",
        spaceId
    );
    return sbApi
        .post(`spaces/${spaceId}/stories/`, {
            story: content,
            publish: 1,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const updateStory = () => {};

interface TreeNode {
    id: number;
    parent_id: number | null;
    children?: TreeNode[];
    story: any;
}

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

type Tree = TreeNode[];

interface TraverseAndCreate {
    tree: Tree;
    realParentId: number | null;
    defaultRoot?: any;
}

export const traverseAndCreate = ({
    tree,
    realParentId,
}: TraverseAndCreate) => {
    tree.forEach(async (node) => {
        try {
            const { parent, ...content } = node.story;
            const result = await createStory({
                spaceId,
                content: { ...content, parent_id: realParentId },
            });
            const storyId: number = result.story.id;
            if (node.children) {
                traverseAndCreate({
                    tree: node.children,
                    realParentId: storyId,
                });
            }
        } catch (e) {
            console.log("Error happened");
            console.log(e);
        }
    });
};
