import type { OneComponent } from "../utils/discover.js";
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
import {
    getFileContentWithRequire,
    getFilesContentWithRequire,
    isObjectEmpty,
} from "../utils/main.js";

import { migrateAsset, getAllAssets } from "./assets.js";
import {
    getAllComponentsGroups,
    createComponentsGroup,
    getAllComponents,
    removeComponent,
    removeComponentGroup,
} from "./components.js";
import { updateComponent, createComponent } from "./mutateComponents.js";
import { createPlugin, getPlugin, updatePlugin } from "./plugins.js";
import {
    backupStories,
    createTree,
    getAllStories,
    removeStory,
    traverseAndCreate,
} from "./stories.js";

const _uniqueValuesFrom = (array: any[]) => [...new Set(array)];

const _checkAndPrepareGroups = async (groupsToCheck: any) => {
    const componentsGroups = await getAllComponentsGroups();
    const groupExist = (groupName: any) =>
        componentsGroups.component_groups.find(
            (group: any) => group.name === groupName
        );

    groupsToCheck.forEach(async (groupName: string) => {
        if (!groupExist(groupName)) {
            await createComponentsGroup(groupName);
        }
    });
};

const _resolveGroups = async (
    component: any,
    existedGroups: any,
    remoteComponentsGroups: any
) => {
    if (!component.component_group_name) {
        return { ...component, component_group_uuid: null };
    }
    const componentsGroup = existedGroups.find(
        (group: any) => component.component_group_name === group
    );
    if (componentsGroup) {
        const component_group_uuid =
            remoteComponentsGroups.component_groups.find(
                (remoteComponentsGroup: any) =>
                    remoteComponentsGroup.name === componentsGroup
            ).uuid;

        return { ...component, component_group_uuid };
    }
};

interface SyncComponents {
    specifiedComponents: OneComponent[];
    presets: boolean;
}

export const syncComponents = async ({
    specifiedComponents,
    presets,
}: SyncComponents) => {
    Logger.log("sync2Components: ");

    const specifiedComponentsContent = await Promise.all(
        specifiedComponents.map((component) => {
            return getFileContentWithRequire({ file: component.p });
        })
    );

    const groupsToCheck = _uniqueValuesFrom(
        specifiedComponentsContent
            .filter((component) => component.component_group_name)
            .map((component) => component.component_group_name)
    );

    await _checkAndPrepareGroups(groupsToCheck);

    // after checkAndPrepareGroups remoteComponents will have synced groups with local groups
    // updates of the groups had to happen before creation of them, cause creation/updates of components
    // happens async, so if one component will have the same group, as other one
    // it will be race of condition kinda issue - we will never now, if the group for current processed component
    // already exist or is being created by other request
    const remoteComponents = await getAllComponents();

    const componentsToUpdate = [];
    const componentsToCreate = [];

    for (const component of specifiedComponentsContent) {
        if (!isObjectEmpty(component)) {
            const shouldBeUpdated = remoteComponents.components.find(
                (remoteComponent: any) =>
                    component.name === remoteComponent.name
            );
            if (shouldBeUpdated) {
                componentsToUpdate.push({
                    id: shouldBeUpdated.id,
                    ...component,
                });
            } else {
                componentsToCreate.push(component);
            }
        }
    }

    const componentsGroups = await getAllComponentsGroups();

    componentsToUpdate.length > 0 &&
        Promise.all(
            componentsToUpdate.map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
        ).then((res) => {
            Logger.log("Components to update after check: ");
            res.map((component) => {
                Logger.warning(`   ${component.name}`);
                updateComponent(component, presets);
            });
        });

    componentsToCreate.length > 0 &&
        Promise.all(
            componentsToCreate.map((component) =>
                _resolveGroups(component, groupsToCheck, componentsGroups)
            )
        ).then((res) => {
            Logger.log("Components to create after check: ");
            res.map((component) => {
                Logger.warning(`   ${component.name}`);
                createComponent(component, presets);
            });
        });
};

interface SyncAllComponents {
    presets: boolean;
}

interface SyncProvidedComponents {
    presets: boolean;
    components: string[];
    packageName: boolean;
}

interface SyncProvidedPlugins {
    plugins: string[];
}

export const syncProvidedComponents = async ({
    components,
    presets,
    packageName,
}: SyncProvidedComponents) => {
    if (!packageName) {
        // #1: discover all external .sb.js files
        const allLocalSbComponentsSchemaFiles = await discoverMany({
            scope: SCOPE.local,
            type: LOOKUP_TYPE.fileName,
            fileNames: components,
        });
        // #2: discover all local .sb.js files
        const allExternalSbComponentsSchemaFiles = await discoverMany({
            scope: SCOPE.external,
            type: LOOKUP_TYPE.fileName,
            fileNames: components,
        });
        // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
        const { local, external } = compare({
            local: allLocalSbComponentsSchemaFiles,
            external: allExternalSbComponentsSchemaFiles,
        });

        // #4: sync - do all stuff already done (groups resolving, and so on)
        syncComponents({
            presets,
            specifiedComponents: [...local, ...external],
        });
    } else {
        // implement discovering and syncrhonizing with packageName
        // #1: discover all external .sb.js files
        const allLocalSbComponentsSchemaFiles = discoverManyByPackageName({
            scope: SCOPE.local,
            packageNames: components,
        });
        // #2: discover all local .sb.js files
        const allExternalSbComponentsSchemaFiles = discoverManyByPackageName({
            scope: SCOPE.external,
            packageNames: components,
        });
        // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
        const { local, external } = compare({
            local: allLocalSbComponentsSchemaFiles,
            external: allExternalSbComponentsSchemaFiles,
        });
        // #4: sync - do all stuff already done (groups resolving, and so on)
        syncComponents({
            presets,
            specifiedComponents: [...local, ...external],
        });
    }
};

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

export const syncAllComponents = async ({ presets }: SyncAllComponents) => {
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

    // // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    // #4: sync - do all stuff already done (groups resolving, and so on)
    syncComponents({
        presets,
        specifiedComponents: [...local, ...external],
    });
};

export const removeAllComponents = async () => {
    const { components, component_groups } = await getAllComponents();

    return Promise.all([
        ...components.map(async (component: any) => {
            await removeComponent({ component });
        }),
        ...component_groups.map(async (componentGroup: any) => {
            await removeComponentGroup({ componentGroup });
        }),
    ]);
};

export const removeSpecifiedComponents = async ({
    components,
}: {
    components: any;
}) => {
    const remoteComponents = await getAllComponents();
    const componentsToRemove: any = [];

    components.map((component: any) => {
        const shouldBeRemoved = remoteComponents.components.find(
            (remoteComponent: any) => component === remoteComponent.name
        );
        shouldBeRemoved && componentsToRemove.push(shouldBeRemoved);
    });

    return (
        componentsToRemove.length > 0 &&
        Promise.all(
            componentsToRemove.map((component: any) => {
                removeComponent({ component });
            })
        )
    );
};

interface SyncContent {
    type: "stories" | "assets";
    transmission: {
        from: string;
        to: string;
    };
    syncDirection: SyncDirection;
}

interface SyncStories {
    transmission: SyncContent["transmission"];
    stories: any[];
}

const syncStories = async ({
    transmission: { from, to },
    stories,
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

    await traverseAndCreate({ tree, realParentId: null });
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
}: SyncContent) => {
    if (type === "stories") {
        if (syncDirection === "fromSpaceToFile") {
            await backupStories({
                filename: transmission.to,
                suffix: ".sb.stories",
            });
        }

        if (syncDirection === "fromSpaceToSpace") {
            const stories = await getAllStories({ spaceId: transmission.from });
            await syncStories({ transmission, stories });
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

            await syncStories({ transmission, stories: storiesFileContent[0] });
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

export const syncProvidedPlugins = async ({ plugins }: SyncProvidedPlugins) => {
    const body = await readFile("dist/export.js");
    if (plugins.length === 1) {
        const pluginName = plugins[0];
        const plugin = await getPlugin(pluginName);
        if (plugin) {
            Logger.log("Plugin exist.");
            Logger.log("Start updating plugin....");
            return await updatePlugin({ plugin: plugin.field_type, body });
        } else {
            Logger.log("Start creating plugin...");
            const { field_type } = await createPlugin(pluginName as string);
            Logger.log("Start updating plugin...");
            return await updatePlugin({ plugin: field_type, body });
        }
    }
};
