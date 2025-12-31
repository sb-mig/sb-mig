"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDatasourceEntry = exports.createDatasourceEntry = exports.createDatasourceEntries = exports.getDatasourceEntries = void 0;
const chalk_1 = __importDefault(require("chalk"));
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const object_utils_js_1 = require("../../utils/object-utils.js");
const datasources_js_1 = require("./datasources.js");
const _decorateWithDimensions = async (args, config) => {
    const { currentDatasource, dimensionsData, _callback } = args;
    const { spaceId, sbApi } = config;
    // callback for create or update
    await _callback();
    const dimensionValueEntries = Object.entries(dimensionsData.dimensionValues);
    return dimensionValueEntries.map(([name, value]) => {
        const data = dimensionsData.datasourceDimensions.find((dimension) => dimension.name === name);
        const params = {
            datasource_entry: {
                ...dimensionsData.finalDatasource_entry,
                id: dimensionsData.finalDatasource_entry.datasource_id,
                dimension_value: value,
            },
            dimension_id: data.id,
        };
        return sbApi
            .put(`spaces/${spaceId}/datasource_entries/${dimensionsData.finalDatasource_entry.id}`, params)
            .then((_) => {
            console.log(`${chalk_1.default.green("✓ Datasource Entry Dimension value for")} ${chalk_1.default.blue(dimensionsData.finalDatasource_entry.name)} and dimension ${chalk_1.default.blue(name)} in ${chalk_1.default.red(currentDatasource.datasource.name)} datasource ${chalk_1.default.green("was successfully updated.")}`);
            return true;
        })
            .catch((err) => {
            logger_js_1.default.error(err);
        });
    });
};
const getDatasourceEntries = async (args, config) => {
    const { datasourceName } = args;
    const { spaceId, sbApi } = config;
    logger_js_1.default.log(`Trying to get '${datasourceName}' datasource entries.`);
    const data = await (0, datasources_js_1.getDatasource)({ datasourceName }, config); // TODO: maybe this step is not needed, i think we can retrieve entries directly using slug (but using delivery api, not management)
    if (data) {
        return sbApi
            .get(`spaces/${spaceId}/datasource_entries/`, {
            datasource_id: data[0].id,
        })
            .then(async (response) => {
            logger_js_1.default.success(`Datasource Entries for '${datasourceName}' datasource successfully retrieved.`);
            const { data } = response;
            return data;
        })
            .catch((err) => logger_js_1.default.error(err));
    }
};
exports.getDatasourceEntries = getDatasourceEntries;
const createDatasourceEntries = (args, config) => {
    const { datasource_entries, remoteDatasourceEntries, data } = args;
    Promise.all(datasource_entries.map((datasourceEntry) => {
        const datasourceToBeUpdated = remoteDatasourceEntries.datasource_entries.find((remoteDatasourceEntry) => remoteDatasourceEntry.name ===
            Object.values(datasourceEntry)[0]);
        if (datasourceToBeUpdated) {
            return (0, exports.updateDatasourceEntry)({ data, datasourceEntry, datasourceToBeUpdated }, config);
        }
        return (0, exports.createDatasourceEntry)({ data, datasourceEntry }, config);
    }))
        .then((_) => {
        logger_js_1.default.success(`Datasource entries for ${data.datasource.id} datasource id has been successfully synced.`);
        return data;
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.createDatasourceEntries = createDatasourceEntries;
const _createDatasourceEntry = (args, config) => {
    const { currentDatasource, finalDatasource_entry } = args;
    const { spaceId, sbApi } = config;
    if (config.debug) {
        console.log("############# Entity to Create: ");
        console.log(finalDatasource_entry);
        console.log("################################");
    }
    return sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
        datasource_entry: finalDatasource_entry,
    })
        .then(({ data }) => {
        console.log(`${chalk_1.default.green("✓ Datasource Entry")} ${chalk_1.default.blue(data.datasource_entry.name)} in ${chalk_1.default.red(currentDatasource.datasource.name)} datasource ${chalk_1.default.green("was successfully created.")}`);
        return data;
    })
        .catch((err) => {
        if (config.debug) {
            console.log("Full Create error: ");
            console.log(err);
        }
        logger_js_1.default.error(`Unable to create datasource entry in ${currentDatasource.datasource.name} datasource.`);
    });
};
const createDatasourceEntry = (args, config) => {
    const { datasourceEntry, data } = args;
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
    };
    if ((0, object_utils_js_1.isObjectEmpty)(datasourceEntry.dimension_values)) {
        return _createDatasourceEntry({ currentDatasource: data, finalDatasource_entry }, config);
    }
    else {
        return _decorateWithDimensions({
            currentDatasource: data,
            dimensionsData: {
                finalDatasource_entry,
                dimensionValues: datasourceEntry.dimension_values,
                datasourceDimensions: data.datasource.dimensions,
            },
            _callback: () => _createDatasourceEntry({ currentDatasource: data, finalDatasource_entry }, config),
        }, config);
    }
};
exports.createDatasourceEntry = createDatasourceEntry;
const _updateDatasourceEntry = (args, config) => {
    const { currentDatasource, finalDatasource_entry } = args;
    const { spaceId, sbApi } = config;
    return sbApi
        .put(`spaces/${spaceId}/datasource_entries/${finalDatasource_entry.id}`, {
        datasource_entry: finalDatasource_entry,
    })
        .then((_) => {
        console.log(`${chalk_1.default.green("✓ Datasource Entry")} ${chalk_1.default.blue(finalDatasource_entry.name)} in ${chalk_1.default.red(currentDatasource.datasource.name)} datasource ${chalk_1.default.green("was successfully updated.")}`);
        return true;
    })
        .catch((err) => {
        if (config.debug) {
            console.log("Full update error: ");
            console.log(err);
        }
        logger_js_1.default.error(`Unable to update datasource entry in ${currentDatasource.datasource.name} datasource.`);
    });
};
const updateDatasourceEntry = (args, config) => {
    const { datasourceEntry, datasourceToBeUpdated, data } = args;
    const finalDatasource_entry = {
        name: datasourceEntry.name,
        value: datasourceEntry.value,
        datasource_id: data.datasource.id,
        id: datasourceToBeUpdated.id,
    };
    if ((0, object_utils_js_1.isObjectEmpty)(datasourceEntry.dimension_values)) {
        return _updateDatasourceEntry({ currentDatasource: data, finalDatasource_entry }, config);
    }
    else {
        return _decorateWithDimensions({
            currentDatasource: data,
            _callback: () => _updateDatasourceEntry({
                currentDatasource: data,
                finalDatasource_entry,
            }, config),
            dimensionsData: {
                finalDatasource_entry,
                dimensionValues: datasourceEntry.dimension_values,
                datasourceDimensions: data.datasource.dimensions,
            },
        }, config);
    }
};
exports.updateDatasourceEntry = updateDatasourceEntry;
