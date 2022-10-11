// GET
import { sbApi } from "./config.js";

export const getAllPlugins = () => {
    console.log("Trying to get all plugins.");

    return sbApi
        .get(`field_types?per_page=100`)
        .then((res: any) => {
            console.log(
                `Amount of field types: ${res.data.field_types.length}`
            );
            return res.data;
        })
        .catch((err: any) => console.error(err));
};

export const getPlugin = (pluginName: string | undefined) => {
    return getAllPlugins()
        .then((res) =>
            res.field_types.find((plugin: any) => plugin.name === pluginName)
        )
        .then((res) => {
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
        .catch((err) => console.error(err));
};

export const getPluginDetails = (plugin: any) => {
    console.log(`Trying to get ${plugin.name} details `);

    return sbApi
        .get(`field_types/${plugin.id}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

interface UpdatePlugin {
    plugin: any;
    body?: string;
}

export const updatePlugin = ({ plugin, body }: UpdatePlugin) => {
    console.log("update plugin...");
    console.log(plugin);
    return sbApi
        .put(`field_types/${plugin.id}`, {
            field_type: {
                body,
                compiled_body: "",
            },
        })
        .then((res) => {
            console.info(`'${plugin.name}' updated!`);
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
            field_type: {
                name: pluginName,
            },
        })
        .then((res) => {
            console.log("Created plugin");
            console.log(res);
            return res.data;
        })
        .catch((err: any) => {
            console.log(err);
            console.error("Error happened :()");
        });
};
