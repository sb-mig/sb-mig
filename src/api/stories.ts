import { createAndSaveToStoriesFile } from "../utils/files.js";
import Logger from "../utils/logger.js";
import { generateDatestamp } from "../utils/others.js";

import { sbApi } from "./config.js";

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
    Logger.log(`Trying to get all Stories from: ${spaceId}`);

    const allStoriesWithoutContent: any = await sbApi
        .get(`spaces/${spaceId}/stories/`, {
            per_page: 100,
        })
        .then((res: any) => res.data.stories)

        .catch((err: any) => console.error(err));

    const allStories = await Promise.all(
        allStoriesWithoutContent.map(
            async (story: any) =>
                await getStoryById({ spaceId, storyId: story.id })
        )
    );

    return allStories;
};

// GET
export const getStoryById = ({
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

export const getStoryBySlug = async ({
    spaceId,
    slug,
}: {
    spaceId: string;
    slug: string;
}) => {
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
            async (story: any) =>
                await getStoryById({ spaceId, storyId: story.id })
        )
    );

    return storiesWithContent[0];
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
    spaceId: string;
}

export const traverseAndCreate = ({
    tree,
    realParentId,
    spaceId,
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
                    spaceId,
                });
            }
        } catch (e) {
            console.log("Error happened");
            console.log(e);
        }
    });
};

export const backupStories = async ({
    filename,
    suffix,
    spaceId,
}: {
    filename: string;
    spaceId: string;
    suffix?: string;
}) => {
    Logger.log(`Making backup of your stories.`);
    const timestamp = generateDatestamp(new Date());
    await getAllStories({ spaceId })
        .then(async (res: any) => {
            await createAndSaveToStoriesFile({
                filename: `${filename}_${timestamp}`,
                suffix,
                folder: "stories",
                res,
            });
        })
        .catch((err: any) => {
            Logger.error(err);
            Logger.error("error happened... :(");
        });
};
