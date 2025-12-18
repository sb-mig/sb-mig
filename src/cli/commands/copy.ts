import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import { createTree, traverseAndCreate } from "../../api/stories/tree.js";
import { TreeNode } from "../../api/stories/tree.types.js";
import { dumpToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import {
    getFrom,
    getRecursive,
    getSourceSpace,
    getTargetSpace,
    getTo,
    getWhat,
    getWhere,
} from "../utils/cli-utils.js";

const COPY_COMMANDS = {
    stories: "stories",
};

type DecideStrategyArgs = {
    what: string;
    sourceSpace: string;
};

const attachToFolder = async (where: string, targetSpace: string) => {
    console.log("attachToFolder", where, targetSpace);
    const entryStory = await managementApi.stories.getStoryBySlug(where, {
        ...apiConfig,
        spaceId: targetSpace,
    });

    console.log("entryStory", entryStory);

    return entryStory;
};

const decideStrategy = async (args: DecideStrategyArgs) => {
    const { what, sourceSpace } = args;
    // Check if path ends with /* for recursive folder strategy
    if (what.endsWith("/*")) {
        const folderPath = what.slice(0, -2); // Remove /* from the endcurso
        const entryStory = await managementApi.stories.getStoryBySlug(
            folderPath,
            {
                ...apiConfig,
                spaceId: sourceSpace,
            },
        );

        if (!entryStory) {
            throw new Error(`Story not found: ${folderPath}`);
        }

        if (!entryStory.story.is_folder) {
            throw new Error(`${folderPath} is not a folder`);
        }

        return { strategy: "folder_recursive" };
    }

    // For regular paths, check if it's a folder or story
    const entryStory = await managementApi.stories.getStoryBySlug(what, {
        ...apiConfig,
        spaceId: sourceSpace,
    });

    if (!entryStory) {
        throw new Error(`Story not found: ${what}`);
    }

    const entryStoryIsFolder = entryStory.story.is_folder;

    if (entryStoryIsFolder) {
        return { strategy: "folder_with_root" };
    }

    return { strategy: "story" };
};

export const copyCommand = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case COPY_COMMANDS.stories:
            Logger.warning(`test sb-mig... with command: ${command}`);

            console.log({ flags });

            const sourceSpace = getSourceSpace(flags, apiConfig);
            const targetSpace = getTargetSpace(flags, apiConfig);
            const what = getWhat(flags);
            const where = getWhere(flags);

            console.log({ sourceSpace, targetSpace, what, where });

            const { strategy } = await decideStrategy({ what, sourceSpace });

            if (strategy === "folder_recursive") {
                console.log({ strategy });
                const rootStorySlug = what.slice(0, -2);

                // 0. get the root story
                const rootStory = await managementApi.stories.getStoryBySlug(
                    rootStorySlug,
                    {
                        ...apiConfig,
                        spaceId: sourceSpace,
                    },
                );

                // 1. get all stories inside this folder, and recursively
                const allSourceStories = [rootStory].concat(
                    await managementApi.stories.getAllStories(
                        {
                            options: {
                                starts_with: `${rootStorySlug}/`,
                            },
                        },
                        {
                            ...apiConfig,
                            spaceId: sourceSpace,
                        },
                    ),
                );

                const normalizedStories = allSourceStories
                    .map((item: any) => item.story)
                    .map((item: any) => {
                        if (item.full_slug === rootStorySlug) {
                            return {
                                ...item,
                                parent_id: null,
                            };
                        }

                        return {
                            ...item,
                        };
                    });

                const treeOfStories = createTree(normalizedStories);
                const entryStory = await attachToFolder(where, targetSpace);
                const reAttachedTreeOfStories = treeOfStories[0]?.children?.map(
                    (child: any) => {
                        return {
                            ...child,
                            parent_id: entryStory.story.id,
                            story: {
                                ...child.story,
                                parent_id: entryStory.story.id,
                            },
                        };
                    },
                );

                await traverseAndCreate(
                    {
                        tree: reAttachedTreeOfStories as any,
                        realParentId: entryStory.story.id,
                        spaceId: targetSpace,
                    },
                    {
                        ...apiConfig,
                        spaceId: targetSpace,
                    },
                );
            }

            if (strategy === "folder_with_root") {
                console.log({ strategy });
                // 0. get the root story
                const rootStory = await managementApi.stories.getStoryBySlug(
                    what,
                    {
                        ...apiConfig,
                        spaceId: sourceSpace,
                    },
                );

                // 1. get all stories
                const allSourceStories = [rootStory].concat(
                    await managementApi.stories.getAllStories(
                        {
                            options: {
                                starts_with: `${what}/`,
                            },
                        },
                        {
                            ...apiConfig,
                            spaceId: sourceSpace,
                        },
                    ),
                );

                const normalizedStories = allSourceStories
                    .map((item: any) => item.story)
                    .map((item: any) => {
                        if (item.full_slug === what) {
                            return {
                                ...item,
                                parent_id: null,
                            };
                        }

                        return {
                            ...item,
                        };
                    });

                const treeOfStories = createTree(normalizedStories);
                const entryStory = await attachToFolder(where, targetSpace);

                const enhancedTreeOfStories = {
                    ...treeOfStories[0],
                    parent_id: entryStory.story.id,
                };

                await traverseAndCreate(
                    {
                        tree: [enhancedTreeOfStories] as any,
                        realParentId: entryStory.story.id,
                        spaceId: targetSpace,
                    },
                    {
                        ...apiConfig,
                        spaceId: targetSpace,
                    },
                );
            }

            if (strategy === "story") {
                console.log({ strategy });

                const entryStory = await managementApi.stories.getStoryBySlug(
                    what,
                    {
                        ...apiConfig,
                        spaceId: sourceSpace,
                    },
                );

                const targetEntryStory = await attachToFolder(
                    where,
                    targetSpace,
                );

                const finalStories = [
                    {
                        ...entryStory.story,
                        parent_id: targetEntryStory.story.id,
                    },
                ];

                const normalizedStories = finalStories.map((item: any) => {
                    if (item.full_slug === what) {
                        return {
                            ...item,
                            parent_id: null,
                        };
                    }

                    return {
                        ...item,
                    };
                });

                const treeOfStories = createTree(normalizedStories);

                await traverseAndCreate(
                    {
                        tree: treeOfStories as any,
                        realParentId: targetEntryStory.story.id,
                        spaceId: targetSpace,
                    },
                    {
                        ...apiConfig,
                        spaceId: targetSpace,
                    },
                );
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
