import chalk from "chalk";

import storyblokConfig from "../config/config.js";
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

interface GetAllItemsWithPagination {
    apiFn: (...args: any) => any;
    params: any;
    itemsKey: string;
}

export const getAllItemsWithPagination = async ({
    apiFn,
    params,
    itemsKey,
}: GetAllItemsWithPagination) => {
    const per_page = 100;
    const allItems = [];
    let page = 1;
    let totalPages;
    let amountOfFetchedItems = 0;

    do {
        const response = await apiFn({ per_page, page, ...params });

        if (!totalPages) {
            totalPages = Math.ceil(response.total / response.perPage);
        }

        amountOfFetchedItems +=
            response.total - amountOfFetchedItems > per_page
                ? per_page
                : response.total - amountOfFetchedItems;

        Logger.success(
            `${amountOfFetchedItems} of ${response.total} items fetched.`
        );

        if (storyblokConfig.debug) {
            Logger.warning(
                "####### response in getAllItemsWithPagination #######"
            );
            Logger.warning(response);
            Logger.warning(
                "#####################################################"
            );
        }

        allItems.push(...response.data[itemsKey]);

        page++;
    } while (page <= totalPages);

    return allItems;
};

// GET
export const getAllStories = async ({ spaceId }: { spaceId: string }) => {
    Logger.log(`Trying to get all Stories from: ${spaceId}`);

    const allStoriesWithoutContent = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi.get(`spaces/${spaceId}/stories/`, {
                per_page,
                page,
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
            const result = await getStoryById({ spaceId, storyId: story.id });

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
export const getStoryById = ({
    spaceId,
    storyId,
}: {
    spaceId: string;
    storyId: string;
}) => {
    if (storyblokConfig.debug) {
        console.log(
            `Trying to get Story with id: ${storyId} from space: ${spaceId}, to fill content field.`
        );
    }
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res: any) => {
            if (storyblokConfig.debug) {
                Logger.success(
                    `Successfuly fetched story with content, with id: ${storyId} from space: ${spaceId}.`
                );
            }

            return res.data;
        })
        .catch((err: any) => Logger.error(err));
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

export interface CreateStory {
    spaceId: string;
    content: any;
}

// CREATE
export const createStory = ({ spaceId, content }: CreateStory) => {
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

export interface UpdateStory {
    spaceId: string;
    content: any;
    storyId: string;
}

// UPDATE
export const updateStory = ({ spaceId, content, storyId }: UpdateStory) => {
    Logger.warning("Trying to update Story...");
    Logger.log(
        `Updating story with name: ${content.name} in space: ${spaceId}`
    );
    return sbApi
        .put(`spaces/${spaceId}/stories/${storyId}`, {
            story: content,
            publish: 1,
        })
        .then((res: any) => {
            console.log(`${chalk.green(res.data.story.full_slug)} updated.`);
            return res.data;
        })
        .catch((err: any) => console.error(err));
};

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
            Logger.error("Error happened");
            Logger.error(e);
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
