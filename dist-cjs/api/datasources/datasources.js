"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncDatasourcesData = exports.updateDatasource = exports.createDatasource = exports.getDatasource = exports.getAllDatasources = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const request_js_1 = require("../utils/request.js");
const datasource_entries_js_1 = require("./datasource-entries.js");
// GET
const getAllDatasources = (config) => {
    const { sbApi, spaceId } = config;
    logger_js_1.default.log("Trying to get all Datasources.");
    return (0, request_js_1.getAllItemsWithPagination)({
        // @ts-ignore
        apiFn: ({ per_page, page }) => {
            return sbApi
                .get(`spaces/${spaceId}/datasources/`)
                .then((res) => {
                if (res.total) {
                    logger_js_1.default.log(`Amount of datasources: ${res.total}`);
                }
                return res;
            })
                .catch((err) => {
                if (err.response.status === 404) {
                    logger_js_1.default.error(`There is no datasources in your Storyblok ${spaceId} space.`);
                    return true;
                }
                else {
                    logger_js_1.default.error(err);
                    return false;
                }
            });
        },
        params: {
            spaceId,
        },
        itemsKey: "datasources",
    });
};
exports.getAllDatasources = getAllDatasources;
const getDatasource = (args, config) => {
    const { datasourceName } = args;
    logger_js_1.default.log(`Trying to get '${datasourceName}' datasource.`);
    return (0, exports.getAllDatasources)(config)
        .then((res) => {
        if (res) {
            return res.filter((datasource) => datasource.name === datasourceName);
        }
        else {
            return [];
        }
    })
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            logger_js_1.default.warning(`There is no datasource named '${datasourceName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.getDatasource = getDatasource;
// POST
const createDatasource = (args, config) => {
    const { datasource } = args;
    const { sbApi, spaceId } = config;
    const finalDatasource = {
        name: datasource.name,
        slug: datasource.slug,
        dimensions: [...datasource.dimensions],
        dimensions_attributes: [...datasource.dimensions],
    };
    return sbApi
        .post(`spaces/${spaceId}/datasources/`, {
        datasource: finalDatasource,
    })
        .then(({ data }) => {
        logger_js_1.default.success(`Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`);
        return {
            data,
            datasource_entries: datasource.datasource_entries,
        };
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.createDatasource = createDatasource;
const updateDatasource = (args, config) => {
    const { datasource, datasourceToBeUpdated } = args;
    const { sbApi, spaceId } = config;
    const dimensionsToCreate = datasource.dimensions.filter((dimension) => {
        const isDimensionInRemoteDatasource = datasourceToBeUpdated.dimensions.find((d) => dimension.name === d.name);
        return !isDimensionInRemoteDatasource;
    });
    return sbApi
        .put(`spaces/${spaceId}/datasources/${datasourceToBeUpdated.id}`, {
        datasource: {
            id: datasourceToBeUpdated.id,
            name: datasource.name,
            slug: datasource.slug,
            dimensions: [
                ...datasourceToBeUpdated.dimensions,
                ...dimensionsToCreate,
            ],
            dimensions_attributes: [
                ...datasourceToBeUpdated.dimensions,
                ...dimensionsToCreate,
            ],
        },
    })
        .then(({ data }) => {
        logger_js_1.default.success(`Datasource '${data.datasource.name}' with id '${data.datasource.id}' created.`);
        return {
            data,
            datasource_entries: datasource.datasource_entries,
        };
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.updateDatasource = updateDatasource;
// File-based sync wrapper lives in `datasources.sync.ts` to keep this module CJS-safe.
const syncDatasourcesData = async ({ datasources }, config) => {
    const result = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };
    const remoteDatasourcesRaw = await (0, exports.getAllDatasources)(config);
    const remoteDatasources = Array.isArray(remoteDatasourcesRaw)
        ? remoteDatasourcesRaw
        : [];
    for (const datasource of datasources) {
        const name = String(datasource?.name ?? "unknown");
        if (!datasource || typeof datasource !== "object" || !datasource.name) {
            result.skipped.push(name);
            continue;
        }
        try {
            const datasourceToBeUpdated = remoteDatasources.find((remoteDatasource) => datasource.name === remoteDatasource.name);
            const opResult = datasourceToBeUpdated
                ? await (0, exports.updateDatasource)({ datasource, datasourceToBeUpdated }, config)
                : await (0, exports.createDatasource)({ datasource }, config);
            if (datasourceToBeUpdated)
                result.updated.push(name);
            else
                result.created.push(name);
            if (opResult?.data?.datasource && opResult?.datasource_entries) {
                const remoteDatasourceEntries = await (0, datasource_entries_js_1.getDatasourceEntries)({
                    datasourceName: opResult.data.datasource.name,
                }, config);
                await (0, datasource_entries_js_1.createDatasourceEntries)({
                    data: opResult.data,
                    datasource_entries: opResult.datasource_entries,
                    remoteDatasourceEntries,
                }, config);
            }
        }
        catch (e) {
            result.errors.push({ name, message: String(e) });
        }
    }
    return result;
};
exports.syncDatasourcesData = syncDatasourcesData;
