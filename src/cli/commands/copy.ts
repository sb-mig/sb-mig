import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import { createTree, traverseAndCreate } from "../../api/stories/tree.js";
import { TreeNode } from "../../api/stories/tree.types.js";
import { dumpToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import {
    getFrom,
    getRecursive,
    getSourceSpace,
    getTargetSpace,
    getTo,
    getWhat,
    getWhere,
} from "../../utils/others.js";
import { apiConfig } from "../api-config.js";

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
        const folderPath = what.slice(0, -2); // Remove /* from the end
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

            const sourceSpace = getSourceSpace(flags, apiConfig);
            const targetSpace = getTargetSpace(flags, apiConfig);
            const what = getWhat(flags);
            const where = getWhere(flags);
            // const recursive = getRecursive(flags);

            console.log({ sourceSpace, targetSpace, what, where });

            const { strategy } = await decideStrategy({ what, sourceSpace });

            if (strategy === "folder_recursive") {
                console.log({ strategy });
                // 1. get all stories inside this folder, and recursively
                // 2. create tree of stories
                // 3. pass tree to traverseAndCreate
                // 3.1. update or create
                // traverseAndCreate should be able to check if the space where we copying the whole structure, has the story already
                // if it does, then we should update it, otherwise we should create it, it should happen at every story level
            }

            if (strategy === "folder_with_root") {
                console.log({ strategy });
                // 1. get all stories
                const allSourceStories =
                    await managementApi.stories.getAllStories(
                        {
                            options: {
                                starts_with: what,
                            },
                        },
                        {
                            ...apiConfig,
                            spaceId: sourceSpace,
                        },
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

                const storiesToPassJson = JSON.stringify(
                    treeOfStories,
                    null,
                    2,
                );

                dumpToFile("storiesToPass.json", storiesToPassJson);

                const entryStory = await attachToFolder(where, targetSpace);

                const enhancedTreeOfStories = {
                    ...treeOfStories[0],
                    parent_id: entryStory.story.id,
                };

                const newGlobalParent = [
                    {
                        action: "create",
                        id: entryStory.story.id, // id of the pl guy
                        parent_id: null,
                        story: {
                            ...entryStory.story,
                        },
                        children: [enhancedTreeOfStories],
                    },
                ];

                const finalFinalJson = JSON.stringify(newGlobalParent, null, 2);

                dumpToFile("finalFinal.json", finalFinalJson);

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

                // 2. figure out where to attach the story in the source space
                // 3. create the story in the target space
                // 3.1. check if the story already exists in the target space
                // 3.2. if it does, then update it, otherwise create it
            }

            if (strategy === "story") {
                console.log({ strategy });
                // 1. get this story
                // 2. figure out where to attach the story in the source space
                // 3. create the story in the target space
                // 3.1. check if the story already exists in the target space
                // 3.2. if it does, then update it, otherwise create it
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
