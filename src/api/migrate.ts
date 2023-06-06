import type { SyncProvidedPlugins } from "./v2/plugins/plugins.types.js";
import type { SyncDirection } from "../utils/sync-utils";

import config from "../config/config.js";
import {
    discoverManyByPackageName,
    LOOKUP_TYPE,
    SCOPE,
    compare,
    discover,
    discoverMany,
    discoverStories,
} from "../utils/discover.js";
import { dumpToFile, readFile } from "../utils/files.js";
import Logger from "../utils/logger.js";
import { getFilesContentWithRequire } from "../utils/main.js";

import { migrateAsset, getAllAssets } from "./assets.js";
import { contentHubApi } from "./contentHubApi.js";
import {
    backupStories,
    createTree,
    getAllStories,
    removeStory,
    traverseAndCreate,
} from "./stories.js";
import { createPlugin, getPlugin, updatePlugin } from "./v2/plugins/plugins.js";

export const discoverAllComponents = async () => {
    // #1: discover all external .sb.js files
    const allLocalSbComponentsSchemaFiles = await discover({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });
    // #2: discover all local .sb.js files
    const allExternalSbComponentsSchemaFiles = await discover({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });
    // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    return { local, external };
};

interface SyncContent {
    type: "stories" | "assets";
    transmission: {
        from: string;
        to: string;
    };
    syncDirection: SyncDirection;
    filename?: string;
}

interface SyncStories {
    transmission: SyncContent["transmission"];
    stories: any[];
    toSpaceId: string;
}

const syncStories = async ({
    transmission: { from, to },
    stories,
    toSpaceId,
}: SyncStories) => {
    Logger.log(`We would try to migrate Stories data from: ${from} to: ${to}`);

    const storiesToPass = stories
        .map((item: any) => item.story)
        .map((item: any) =>
            item.parent_id === 0 ? { ...item, parent_id: null } : item
        );

    Logger.warning(`Amount of all stories to migrate: ${storiesToPass.length}`);

    const storiesToPassJson = JSON.stringify(storiesToPass, null, 2);

    if (config.debug) {
        dumpToFile("storiesToPass.json", storiesToPassJson);
    }

    const tree = createTree(storiesToPass);
    const jsonString = JSON.stringify(tree, null, 2);
    if (config.debug) {
        dumpToFile("tree.json", jsonString);
    }

    await traverseAndCreate({ tree, realParentId: null, spaceId: toSpaceId });
};

interface SyncAssets {
    transmission: SyncContent["transmission"];
}

const syncAssets = async ({ transmission: { from, to } }: SyncAssets) => {
    Logger.log(`We would try to migrate Assets data from: ${from} to: ${to}`);

    const allAssets = await getAllAssets({ spaceId: from });
    allAssets.assets.map((asset) => {
        const { id, created_at, updated_at, ...newAssetPayload } = asset;
        migrateAsset({
            migrateTo: to,
            payload: newAssetPayload,
        });
    });
};

export const syncContent = async ({
    type,
    transmission,
    syncDirection,
    filename,
}: SyncContent) => {
    if (type === "stories") {
        if (syncDirection === "fromSpaceToFile") {
            await backupStories({
                filename: transmission.to,
                suffix: ".sb.stories",
                spaceId: transmission.from,
            });
        }

        if (syncDirection === "fromSpaceToSpace") {
            const stories = await getAllStories({ spaceId: transmission.from });
            await syncStories({
                transmission,
                stories,
                toSpaceId: transmission.to,
            });
        }

        if (syncDirection === "fromFileToSpace") {
            const allLocalStories = discoverStories({
                scope: SCOPE.local,
                type: LOOKUP_TYPE.fileName,
                fileNames: [transmission.from],
            });

            const storiesFileContent = getFilesContentWithRequire({
                files: allLocalStories,
            });

            await syncStories({
                transmission,
                stories: storiesFileContent[0],
                toSpaceId: transmission.to,
            });
        }

        if (syncDirection === "fromAWSToSpace") {
            const data = await contentHubApi.getAllStories({
                spaceId: transmission.from,
                storiesFilename: filename,
            });

            await syncStories({
                transmission,
                stories: data.stories,
                toSpaceId: transmission.to,
            });
        }

        return true;
    } else if (type === "assets") {
        await syncAssets({ transmission });
        return true;
    } else {
        throw Error("This should never happen!");
    }
};

export const removeAllStories = async ({ spaceId }: { spaceId: string }) => {
    Logger.warning(
        `Trying to remove all stories from space with spaceId: ${spaceId}`
    );
    const stories = await getAllStories({ spaceId });

    const onlyRootStories = (story: any) =>
        story.story.parent_id === 0 || story.story.parent_id === null;

    const allResponses = Promise.all(
        stories
            .filter(onlyRootStories)
            .map(
                async (story: any) =>
                    await removeStory({ spaceId, storyId: story?.story?.id })
            )
    );

    return allResponses;
};

export const syncProvidedPlugins: SyncProvidedPlugins = async (
    { plugins },
    config
) => {
    const body = await readFile("dist/export.js");
    if (plugins.length === 1) {
        const pluginName = plugins[0];
        const plugin = await getPlugin(pluginName, config);
        if (plugin) {
            Logger.log("Plugin exist.");
            Logger.log("Start updating plugin....");
            return await updatePlugin(
                { plugin: plugin.field_type, body },
                config
            );
        } else {
            Logger.log("Start creating plugin...");
            const { field_type } = await createPlugin(
                pluginName as string,
                config
            );
            Logger.log("Start updating plugin...");
            return await updatePlugin({ plugin: field_type, body }, config);
        }
    }
};
