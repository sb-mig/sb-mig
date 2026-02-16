import type { ApiClient } from "../client.js";

import { getAllItemsWithPagination } from "../../api/utils/request.js";

export async function getAllPlugins(client: ApiClient): Promise<any> {
    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            client.sbApi.get("field_types", { per_page, page }),
        params: {},
        itemsKey: "field_types",
    });
}

export async function getPlugin(
    client: ApiClient,
    pluginName: string,
): Promise<any> {
    const plugins = await getAllPlugins(client);
    const plugin = plugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    return await getPluginDetails(client, plugin);
}

export async function getPluginDetails(
    client: ApiClient,
    plugin: any,
): Promise<any> {
    return client.sbApi
        .get(`field_types/${plugin.id}`)
        .then((res: any) => res.data);
}

export async function updatePlugin(
    client: ApiClient,
    args: { plugin: any; body: string },
): Promise<any> {
    const { plugin, body } = args;
    return client.sbApi
        .put(`field_types/${plugin.id}`, {
            publish: true,
            field_type: {
                body,
                compiled_body: "",
            },
        } as any)
        .then((res: any) => res.data);
}

export async function createPlugin(
    client: ApiClient,
    pluginName: string,
): Promise<any> {
    return client.sbApi
        .post("field_types", {
            publish: true,
            field_type: {
                name: pluginName,
            },
        } as any)
        .then((res: any) => res.data);
}
