// GET
import Logger from "../utils/logger.js";

import { sbApi } from "./config.js";
import { getAllItemsWithPagination } from "./stories.js";

export const getAllPlugins = () => {
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

export const getPlugin = (pluginName: string | undefined) => {
    return getAllPlugins()
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
            return getPluginDetails(plugin)
                .then((res) => res)
                .catch((err) => console.error(err));
        })
        .catch((err) => {
            Logger.warning(err.message);
            return false;
        });
};

export const getPluginDetails = (plugin: any) => {
    console.log(`Trying to get ${plugin.name} details `);

    return sbApi
        .get(`field_types/${plugin.id}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

interface UpdatePlugin {
    plugin: {
        id: number;
        name: string;
    };
    body?: string;
}

export const updatePlugin = ({ plugin, body }: UpdatePlugin) => {
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

export const createPlugin = (pluginName: string) => {
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
