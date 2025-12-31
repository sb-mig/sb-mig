"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncPluginsData = exports.createPlugin = exports.updatePlugin = exports.getPluginDetails = exports.getPlugin = exports.getAllPlugins = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const request_js_1 = require("../utils/request.js");
const getAllPlugins = (config) => {
    const { sbApi, spaceId } = config;
    logger_js_1.default.log("Trying to get all plugins.");
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => sbApi
            .get(`field_types`, {
            per_page,
            page,
        })
            .then((res) => {
            logger_js_1.default.log(`Amount of field types: ${res.total}`);
            return res;
        })
            .catch((err) => logger_js_1.default.error(err)),
        params: {},
        itemsKey: "field_types",
    });
};
exports.getAllPlugins = getAllPlugins;
const getPlugin = (pluginName, config) => {
    return (0, exports.getAllPlugins)(config)
        .then((res) => res.find((plugin) => plugin.name === pluginName))
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
        return (0, exports.getPluginDetails)(plugin, config)
            .then((res) => res)
            .catch((err) => console.error(err));
    })
        .catch((err) => {
        logger_js_1.default.warning(err.message);
        return false;
    });
};
exports.getPlugin = getPlugin;
const getPluginDetails = (plugin, config) => {
    const { sbApi } = config;
    console.log(`Trying to get ${plugin.name} details `);
    return sbApi
        .get(`field_types/${plugin.id}`)
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.getPluginDetails = getPluginDetails;
const updatePlugin = ({ plugin, body }, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .put(`field_types/${plugin.id}`, {
        publish: true,
        field_type: {
            body,
            compiled_body: "",
        },
    })
        .then((res) => {
        logger_js_1.default.success(`'${plugin.name}' plugin updated!`);
        return res.data;
    })
        .catch((err) => {
        console.log(err);
        console.error("Error happened :()");
    });
};
exports.updatePlugin = updatePlugin;
const createPlugin = (pluginName, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .post(`field_types`, {
        publish: true,
        field_type: {
            name: pluginName,
        },
    })
        .then((res) => {
        logger_js_1.default.success(`'${pluginName}' plugin created!`);
        return res.data;
    })
        .catch((err) => {
        console.log(err);
        console.error("Error happened :()");
    });
};
exports.createPlugin = createPlugin;
// File-based sync wrapper lives in `plugins.sync.ts` to keep this module CJS-safe.
const syncPluginsData = async ({ plugins }, config) => {
    const result = {
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
            const plugin = await (0, exports.getPlugin)(name, config);
            if (plugin) {
                await (0, exports.updatePlugin)({ plugin: plugin.field_type, body: p.body }, config);
                result.updated.push(name);
            }
            else {
                const created = await (0, exports.createPlugin)(name, config);
                await (0, exports.updatePlugin)({ plugin: created.field_type, body: p.body }, config);
                result.created.push(name);
            }
        }
        catch (e) {
            result.errors.push({ name, message: String(e) });
        }
    }
    return result;
};
exports.syncPluginsData = syncPluginsData;
