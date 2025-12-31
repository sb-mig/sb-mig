"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPlugins = getAllPlugins;
exports.getPlugin = getPlugin;
exports.getPluginDetails = getPluginDetails;
exports.updatePlugin = updatePlugin;
exports.createPlugin = createPlugin;
const request_js_1 = require("../../api/utils/request.js");
async function getAllPlugins(client) {
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => client.sbApi.get("field_types", { per_page, page }),
        params: {},
        itemsKey: "field_types",
    });
}
async function getPlugin(client, pluginName) {
    const plugins = await getAllPlugins(client);
    const plugin = plugins.find((p) => p.name === pluginName);
    if (!plugin)
        return false;
    return await getPluginDetails(client, plugin);
}
async function getPluginDetails(client, plugin) {
    return client.sbApi
        .get(`field_types/${plugin.id}`)
        .then((res) => res.data);
}
async function updatePlugin(client, args) {
    const { plugin, body } = args;
    return client.sbApi
        .put(`field_types/${plugin.id}`, {
        publish: true,
        field_type: {
            body,
            compiled_body: "",
        },
    })
        .then((res) => res.data);
}
async function createPlugin(client, pluginName) {
    return client.sbApi
        .post("field_types", {
        publish: true,
        field_type: {
            name: pluginName,
        },
    })
        .then((res) => res.data);
}
