import storyblokConfig from "../config/config.js";
import {
    discoverMigrationConfig,
    discoverStories,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";
import { createAndSaveToStoriesFile } from "../utils/files.js";
import Logger from "../utils/logger.js";
import { getFilesContentWithRequire } from "../utils/main.js";
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

    if (storyblokConfig.debug) {
        Logger.warning("####### getAllItemsWithPagination #######");
        Logger.warning({ params, per_page, page });
        Logger.warning("#########################################");
    }

    do {
        const response = await apiFn({ per_page, page, ...params });

        if (storyblokConfig.debug) {
            Logger.warning(
                "####### response in getAllItemsWithPagination #######"
            );
            Logger.warning(response);
            Logger.warning(
                "#####################################################"
            );
        }

        if (!totalPages) {
            totalPages = Math.ceil(response.total / response.perPage);
        }

        Logger.log(`Total pages: ${totalPages}`);

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
    Logger.log(`Moving story with name: ${content.name} to space: ${spaceId}`);
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
    console.log({ filename, suffix });
    Logger.log(`Making backup of your stories.`);
    const timestamp = generateDatestamp(new Date());
    await getAllStories({ spaceId })
        .then(async (res: any) => {
            console.log("Amount of stories received: ");
            console.log(res.length);
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

export type MigrateFrom = "file" | "space";

interface MigrateStories {
    from: string;
    migrateFrom: MigrateFrom;
    pageId: string;
    migrationConfig: string;
}

interface ReplaceComponentData {
    parent: any;
    key: any;
    component: string;
    mapper: (data: any) => any;
    depth: number;
    maxDepth: number;
}

function replaceComponentData({
    parent,
    key,
    component,
    mapper,
    depth,
    maxDepth,
}: ReplaceComponentData) {
    let currentMaxDepth = depth;
    if (storyblokConfig.debug) {
        Logger.warning(`Current max depth: ${depth}`);
    }

    if (typeof parent[key] === "object") {
        if (parent[key]?.component === component) {
            const { content, citation, ...rest } = parent[key];
            const dataToReplace = mapper(parent[key]);
            parent[key] = { ...rest, ...dataToReplace };
        }

        if (Array.isArray(parent[key])) {
            for (let i = 0; i < parent[key].length; i++) {
                const childMaxDepth = replaceComponentData({
                    parent: parent[key],
                    key: i,
                    component,
                    mapper,
                    depth: depth + 1,
                    maxDepth,
                });
                currentMaxDepth = Math.max(currentMaxDepth, childMaxDepth);
            }
        } else {
            for (const subKey in parent[key]) {
                const childMaxDepth = replaceComponentData({
                    parent: parent[key],
                    key: subKey,
                    component,
                    mapper,
                    depth: depth + 1,
                    maxDepth,
                });
                currentMaxDepth = Math.max(currentMaxDepth, childMaxDepth);
            }
        }
    }

    return currentMaxDepth;
}

export const migrateStories = async ({
    migrationConfig,
    migrateFrom,
    from,
    pageId,
}: MigrateStories) => {
    console.log({ migrationConfig, migrateFrom, from, pageId });
    if (migrateFrom === "file") {
        Logger.log("Migrating using file....");

        const allLocalStories = discoverStories({
            scope: SCOPE.local,
            type: LOOKUP_TYPE.fileName,
            fileNames: [from],
        });

        const storiesFileContent = getFilesContentWithRequire({
            files: allLocalStories,
        });

        const singleStory = storiesFileContent[0].find(
            ({ story }: any) => story.id === pageId
        );

        console.log("This is stories content from file: ");
        console.log(storiesFileContent);

        console.log("Single story: ");
        console.log(singleStory);

        const migrationConfigFiles = discoverMigrationConfig({
            scope: SCOPE.local,
            type: LOOKUP_TYPE.fileName,
            fileNames: [migrationConfig],
        });

        const migrationConfigFileContent = getFilesContentWithRequire({
            files: migrationConfigFiles,
        });

        console.log("This is migration config file content: ");
        console.log(migrationConfigFileContent);

        // const json = {
        //     "content": {
        //         //... your JSON structure
        //     }
        // };

        const componentToMigrate:
            | "sb-blockquote-flex-group"
            | "sb-blockquote-section" = "sb-blockquote-section";

        const arrayOfMaxDepths: number[] = [];

        storiesFileContent[0].map((stories: any, index: number) => {
            Logger.success(`#   ${index}   #`);
            const json = stories.story.content;
            const maxDepth = replaceComponentData({
                parent: { root: json },
                key: "root",
                component: componentToMigrate,
                mapper: migrationConfigFileContent[0][0][componentToMigrate],
                depth: 0,
                maxDepth: 0,
            });

            arrayOfMaxDepths.push(maxDepth);
        });

        const maxOfMax = Math.max(...arrayOfMaxDepths);

        console.log("#################");
        console.log("#################");
        console.log("#################");
        if (maxOfMax > 30) {
            Logger.error(`Max depth: ${maxOfMax}`);
        } else {
            Logger.success(`Max depth: ${maxOfMax}`);
        }
        console.log("#################");
        console.log("#################");
        console.log("#################");

        // const json = singleStory.story.content;
        // const maxDepth = replaceComponentData({
        //     parent: {root: json},
        //     key: 'root',
        //     component: componentToMigrate,
        //     mapper: migrationConfigFileContent[0][0][componentToMigrate],
        //     depth: 0,
        //     maxDepth: 0
        // })
        //
        // if(maxDepth > 30) {
        //     Logger.error(`Max depth: ${maxDepth}`)
        // } else {
        //     Logger.success(`Max depth: ${maxDepth}`)
        // }

        // replaceComponentData({{root: json}, key: 'root', replacementData, component: replacementData.component});

        // await createAndSaveToStoriesFile({
        //     filename: `new_stuffffff`,
        //     suffix: 'dupa-',
        //     folder: "migrations",
        //     res: json,
        // });
    } else {
        Logger.log("Migrating using space....");
        Logger.log("------------ not implemented yet ------------");
    }
};
