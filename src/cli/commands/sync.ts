import type { SyncError, SyncResult } from "../../api/sync/sync.types.js";
import type { CLIOptions } from "../../utils/interfaces.js";
import type { SyncDirection } from "../sync.types.js";

import { managementApi } from "../../api/managementApi.js";
import {
    syncAllComponents,
    syncContent,
    syncProvidedComponents,
    setComponentDefaultPreset,
} from "../../api/migrate.js";
import storyblokConfig from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import {
    syncAllDatasources,
    syncProvidedDatasources,
} from "../datasources/sync.js";
import { askForConfirmation } from "../helpers.js";
import { syncAllRoles, syncProvidedRoles } from "../roles/sync.js";
import {
    buildSyncReport,
    emptySyncReport,
    reportCommand,
} from "../utils/agent-output.js";
import {
    getFrom,
    getTo,
    isItFactory,
    unpackElements,
} from "../utils/cli-utils.js";

const SYNC_COMMANDS = {
    content: "content",
    components: "components",
    roles: "roles",
    datasources: "datasources",
    plugins: "plugins",
};

// The sync commands that report: `--json`, honest exit codes, a summary.
const AGENT_COMMANDS = [SYNC_COMMANDS.components, SYNC_COMMANDS.datasources];

/** A flag combination no branch handles must not read as a sync that did nothing. */
const unsupportedFlags = (command: string, flags: Record<string, unknown>) =>
    new Error(
        `Unsupported flags for 'sync ${command}': ${
            Object.keys(flags)
                .filter((flag) => flags[flag] !== undefined)
                .map((flag) => `--${flag}`)
                .join(" ") || "(none)"
        }. Run 'sb-mig sync --help' for the supported combinations.`,
    );

export const sync = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];
    const dryRun = Boolean(flags["dryRun"]);
    const json = Boolean(flags["json"]);
    const rules = {
        all: ["all"],
        assets: ["assets"],
        stories: ["stories"],
        allWithSSOT: ["all", "ssot"],
        allWithPresets: ["all", "presets"],
        onlyPresets: ["presets"],
        empty: [],
    };
    const isIt = isItFactory<keyof typeof rules>(flags, rules, [
        "filename",
        "syncDirection",
        "from",
        "to",
        "presets",
        "packageName",
        "yes",
        "dryRun",
        "json",
    ]);

    if (json && !AGENT_COMMANDS.includes(command ?? "")) {
        throw new Error(
            `--json is supported for 'sync components' and 'sync datasources', not for 'sync ${command ?? ""}'.`,
        );
    }

    switch (command) {
        case SYNC_COMMANDS.components:
            Logger.warning(`sync components... with command: ${command}`);

            await reportCommand(
                {
                    json,
                    empty: emptySyncReport("sync components", dryRun),
                },
                async () => {
                    const results: SyncResult[] = [];
                    const errors: SyncError[] = [];
                    const presets = Boolean(flags["presets"]);

                    if (isIt("all")) {
                        Logger.log(
                            `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`,
                        );

                        results.push(
                            await syncAllComponents(presets, apiConfig, {
                                dryRun,
                            }),
                        );

                        if (!dryRun) {
                            errors.push(
                                ...(await setComponentDefaultPreset({
                                    presets,
                                    apiConfig,
                                })),
                            );
                        }
                    } else if (isIt("empty")) {
                        const componentsToSync = unpackElements(input);

                        if (componentsToSync.length === 0) {
                            throw new Error(
                                "Nothing to sync: name the components (sb-mig sync components hero card) or pass --all.",
                            );
                        }

                        Logger.warning("Synchronizing PROVIDED components...");

                        results.push(
                            await syncProvidedComponents(
                                presets,
                                componentsToSync,
                                flags.packageName,
                                apiConfig,
                                { dryRun },
                            ),
                        );

                        if (!dryRun) {
                            errors.push(
                                ...(await setComponentDefaultPreset({
                                    presets,
                                    componentsToSync,
                                    apiConfig,
                                })),
                            );
                        }
                    } else if (isIt("allWithSSOT")) {
                        Logger.warning(
                            "Synchronizing ALL components as Single Source of Truth...",
                        );

                        if (dryRun) {
                            results.push(
                                await syncAllComponents(presets, apiConfig, {
                                    dryRun,
                                    ssot: true,
                                }),
                            );
                        } else {
                            await askForConfirmation(
                                "Are you sure you want to use Single Source of truth? It will remove all your components added in GUI and replace them 1 to 1 with code versions.",
                                async () => {
                                    results.push(
                                        await syncAllComponents(
                                            presets,
                                            apiConfig,
                                            { ssot: true },
                                        ),
                                    );
                                },
                                () => {
                                    Logger.success(
                                        "Syncing components aborted.",
                                    );
                                },
                                flags["yes"],
                            );
                        }
                    } else {
                        throw unsupportedFlags("components", flags);
                    }

                    return buildSyncReport({
                        command: "sync components",
                        dryRun,
                        results,
                        errors,
                    });
                },
            );

            break;
        case SYNC_COMMANDS.roles:
            if (isIt("all")) {
                Logger.log("Syncing all roles...");

                await syncAllRoles(apiConfig, { dryRun });
            }

            if (isIt("empty")) {
                Logger.log("Syncing provided roles...");
                const rolesToSync = unpackElements(input);

                await syncProvidedRoles(
                    { roles: rolesToSync, dryRun },
                    apiConfig,
                );
            }
            break;
        case SYNC_COMMANDS.datasources:
            await reportCommand(
                {
                    json,
                    empty: emptySyncReport("sync datasources", dryRun),
                },
                async () => {
                    const results: SyncResult[] = [];

                    if (isIt("all")) {
                        Logger.log(
                            `${dryRun ? "[dry-run] " : ""}Syncing all datasources with extension...`,
                        );
                        results.push(
                            await syncAllDatasources(apiConfig, { dryRun }),
                        );
                    } else if (isIt("empty")) {
                        const datasourcesToSync = unpackElements(input);

                        if (datasourcesToSync.length === 0) {
                            throw new Error(
                                "Nothing to sync: name the datasources (sb-mig sync datasources colors) or pass --all.",
                            );
                        }

                        Logger.log(
                            `${dryRun ? "[dry-run] " : ""}Syncing provided datasources with extension...`,
                        );
                        results.push(
                            await syncProvidedDatasources(
                                { datasources: datasourcesToSync, dryRun },
                                apiConfig,
                            ),
                        );
                    } else {
                        throw unsupportedFlags("datasources", flags);
                    }

                    return buildSyncReport({
                        command: "sync datasources",
                        dryRun,
                        results,
                    });
                },
            );
            break;
        case SYNC_COMMANDS.content:
            Logger.log(`Syncing content with command: ${command}`);

            const from = getFrom(flags, apiConfig);
            const to = getTo(flags, apiConfig);

            Logger.warning(
                `sync story... from ${from} to working dir spaceid: ${to} with command: ${command}`,
            );

            const syncDirection: SyncDirection = flags["syncDirection"];

            if (storyblokConfig.debug) {
                console.log({
                    from,
                    to,
                    ...flags,
                    syncDirection,
                });
            }

            if (syncDirection) {
                if (isIt("all")) {
                    if (syncDirection !== "fromSpaceToFile") {
                        if (dryRun) {
                            await syncContent(
                                {
                                    type: "stories",
                                    transmission: { from, to },
                                    syncDirection,
                                    dryRun,
                                },
                                apiConfig,
                            );

                            await syncContent(
                                {
                                    type: "assets",
                                    transmission: { from, to },
                                    syncDirection,
                                    dryRun,
                                },
                                apiConfig,
                            );
                        } else {
                            await askForConfirmation(
                                "Are you sure you want to delete all content (stories) in your space and then apply new ones ?",
                                async () => {
                                    Logger.warning(
                                        "Deleting all stories in your space and then applying migrated ones...",
                                    );

                                    // Backup all stories to file
                                    await syncContent(
                                        {
                                            type: "stories",
                                            transmission: {
                                                from: to,
                                                to: `${to}_stories-backup`,
                                            },
                                            syncDirection: "fromSpaceToFile",
                                        },
                                        apiConfig,
                                    );

                                    // Remove all stories from 'to' space
                                    await managementApi.stories.removeAllStories(
                                        {
                                            ...apiConfig,
                                            spaceId: to,
                                        },
                                    );

                                    // Sync stories from 'from' space to 'to' space
                                    await syncContent(
                                        {
                                            type: "stories",
                                            transmission: { from, to },
                                            syncDirection,
                                        },
                                        apiConfig,
                                    );

                                    await syncContent(
                                        {
                                            type: "assets",
                                            transmission: { from, to },
                                            syncDirection,
                                        },
                                        apiConfig,
                                    );
                                },
                                () => {
                                    Logger.success(
                                        "Stories not deleted, exiting the program...",
                                    );
                                },
                                flags["yes"],
                            );
                        }
                    } else {
                        await syncContent(
                            {
                                type: "stories",
                                transmission: { from, to },
                                syncDirection,
                                filename: flags.to,
                                dryRun,
                            },
                            apiConfig,
                        );

                        await syncContent(
                            {
                                type: "assets",
                                transmission: { from, to },
                                syncDirection,
                                dryRun,
                            },
                            apiConfig,
                        );
                    }
                } else if (isIt("assets")) {
                    Logger.warning(
                        `Syncing using sync direction: ${syncDirection}`,
                    );

                    await syncContent(
                        {
                            type: "assets",
                            transmission: { from, to },
                            syncDirection,
                            dryRun,
                        },
                        apiConfig,
                    );
                } else if (isIt("stories")) {
                    Logger.warning(
                        `Syncing using sync direction: ${syncDirection}`,
                    );

                    if (syncDirection !== "fromSpaceToFile") {
                        if (dryRun) {
                            await syncContent(
                                {
                                    type: "stories",
                                    transmission: { from, to },
                                    syncDirection,
                                    dryRun,
                                },
                                apiConfig,
                            );
                        } else {
                            await askForConfirmation(
                                "Are you sure you want to delete all stories in your space and then apply new ones ?",
                                async () => {
                                    Logger.warning(
                                        "Deleting all stories in your space and then applying test ones...",
                                    );

                                    // Backup all stories to file
                                    await syncContent(
                                        {
                                            type: "stories",
                                            transmission: {
                                                from: to,
                                                to: `${to}_stories-backup`,
                                            },
                                            syncDirection: "fromSpaceToFile",
                                        },
                                        apiConfig,
                                    );

                                    // Remove all stories from 'to' space
                                    await managementApi.stories.removeAllStories(
                                        {
                                            ...apiConfig,
                                            spaceId: to,
                                        },
                                    );

                                    //
                                    // Sync stories to 'to' space
                                    await syncContent(
                                        {
                                            type: "stories",
                                            transmission: { from, to },
                                            syncDirection,
                                        },
                                        apiConfig,
                                    );
                                },
                                () => {
                                    Logger.success(
                                        "Stories not deleted, exiting the program...",
                                    );
                                },
                                flags["yes"],
                            );
                        }
                    } else {
                        // Sync stories to 'to' space
                        await syncContent(
                            {
                                type: "stories",
                                transmission: { from, to },
                                syncDirection,
                                dryRun,
                            },
                            apiConfig,
                        );
                    }
                } else {
                    Logger.error(
                        "Wrong combination of flags. check help for more info.",
                    );
                    console.log("Passed flags: ");
                    console.log(flags);
                }
            } else {
                console.log(
                    "You need to provide --syncDirection flag. With one of the following values:  fromSpaceToFile, fromFileToSpace, fromSpaceToSpace \n",
                );
            }

            break;
        case SYNC_COMMANDS.plugins:
            Logger.warning(`sync plugins... with command: ${command}`);

            if (!flags["all"]) {
                Logger.warning("Synchronizing PROVIDED plugins...");
                const pluginsToSync = unpackElements(input);

                await managementApi.plugins.syncProvidedPlugins(
                    {
                        plugins: pluginsToSync,
                        dryRun,
                    },
                    apiConfig,
                );
            }

            break;
        default:
            Logger.error(`no command like that: ${command}`);
            process.exitCode = 1;
    }
};
