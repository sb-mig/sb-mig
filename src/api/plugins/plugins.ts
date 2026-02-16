// GET
import type {
    CreatePlugin,
    GetAllPlugins,
    GetPlugin,
    GetPluginDetails,
    UpdatePlugin,
} from "./plugins.types.js";
import type { SyncResult } from "../sync/sync.types.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

export const getAllPlugins: GetAllPlugins = (config) => {
    const { sbApi, spaceId } = config;
    Logger.log("Trying to get all plugins.");

    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`field_types`, {
                    per_page,
                    page,
                })
                .then((res) => {
                    Logger.log(`Amount of field types: ${res.total}`);

                    return res;
                })
                .catch((err) => Logger.error(err)),
        params: {},
        itemsKey: "field_types",
    });
};

export const getPlugin: GetPlugin = (
    pluginName: string | undefined,
    config,
) => {
    return getAllPlugins(config)
        .then((res) => res.find((plugin: any) => plugin.name === pluginName))
        .then((res) => {
            if (!res) {
                throw Error("Not Found - plugins does not exist");
            }
            if (Array.isArray(res) && res.length === 0) {
                console.info(`There is no plugin named '${pluginName}'`);
                return false;
            }

            return res;
        })
        .then((plugin) => {
            return getPluginDetails(plugin, config)
                .then((res) => res)
                .catch((err) => console.error(err));
        })
        .catch((err) => {
            Logger.warning(err.message);
            return false;
        });
};

export const getPluginDetails: GetPluginDetails = (plugin, config) => {
    const { sbApi } = config;
    console.log(`Trying to get ${plugin.name} details `);

    return sbApi
        .get(`field_types/${plugin.id}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const updatePlugin: UpdatePlugin = ({ plugin, body }, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .put(`field_types/${plugin.id}`, {
            publish: true,
            field_type: {
                body,
                compiled_body: "",
            },
        } as any)
        .then((res: any) => {
            Logger.success(`'${plugin.name}' plugin updated!`);
            return res.data;
        })
        .catch((err: any) => {
            console.log(err);
            console.error("Error happened :()");
        });
};

export const createPlugin: CreatePlugin = (pluginName: string, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .post(`field_types`, {
            publish: true,
            field_type: {
                name: pluginName,
            },
        } as any)
        .then((res: any) => {
            Logger.success(`'${pluginName}' plugin created!`);
            return res.data;
        })
        .catch((err: any) => {
            console.log(err);
            console.error("Error happened :()");
        });
};

// File-based sync wrapper lives in `plugins.sync.ts` to keep this module CJS-safe.

export const syncPluginsData = async (
    { plugins }: { plugins: { name: string; body: string }[] },
    config: any,
): Promise<SyncResult> => {
    const result: SyncResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };

    for (const p of plugins) {
        const name = String(p?.name ?? "unknown");
        if (!p?.name) {
            result.skipped.push(name);
            continue;
        }

        try {
            const plugin = await getPlugin(name, config);
            if (plugin) {
                await updatePlugin(
                    { plugin: plugin.field_type, body: p.body },
                    config,
                );
                result.updated.push(name);
            } else {
                const created = await createPlugin(name, config);
                await updatePlugin(
                    { plugin: created.field_type, body: p.body },
                    config,
                );
                result.created.push(name);
            }
        } catch (e) {
            result.errors.push({ name, message: String(e) });
        }
    }

    return result;
};
