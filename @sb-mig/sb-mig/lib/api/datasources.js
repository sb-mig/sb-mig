"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
const apiConfig_1 = require("./apiConfig");
const discover_1 = require("../utils/discover");
const { spaceId } = config_1.default;
// GET
exports.getAllDatasources = () => {
    logger_1.default.log("Trying to get all Datasources.");
    return apiConfig_1.sbApi
        .get(`spaces/${spaceId}/datasources/`)
        .then(({ data }) => data)
        .catch((err) => {
        if (err.response.status === 404) {
            logger_1.default.error(`There is no datasources in your Storyblok ${spaceId} space.`);
        }
        else {
            logger_1.default.error(err);
            return false;
        }
    });
};
exports.getDatasource = (datasourceName) => {
    logger_1.default.log(`Trying to get '${datasourceName}' datasource.`);
    return exports.getAllDatasources()
        .then((res) => {
        if (res) {
            return res.datasources.filter((datasource) => datasource.name === datasourceName);
        }
    })
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            logger_1.default.warning(`There is no datasource named '${datasourceName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => logger_1.default.error(err));
};
exports.getDatasourceEntries = async (datasourceName) => {
    logger_1.default.log(`Trying to get '${datasourceName}' datasource entries.`);
    const data = await exports.getDatasource(datasourceName);
    if (data) {
        return apiConfig_1.sbApi
            .get(`spaces/${spaceId}/datasource_entries/?datasource_id=${data[0].id}`)
            .then(async ({ data }) => data)
            .catch((err) => logger_1.default.error(err));
    }
};
exports.createDatasource = (datasource) => apiConfig_1.sbApi
    .post(`spaces/${spaceId}/datasources/`, {
    datasource: {
        name: datasource.name,
        slug: datasource.slug
    }
})
    .then(({ data }) => ({
    data,
    datasource_entries: datasource.datasource_entries
}))
    .catch((err) => logger_1.default.error(err));
exports.createDatasourceEntry = (datasourceEntry, datasourceId) => {
    return apiConfig_1.sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
        datasource_entry: {
            name: Object.values(datasourceEntry)[0],
            value: Object.values(datasourceEntry)[1],
            datasource_id: datasourceId
        }
    })
        .then(({ data }) => {
        return data;
    })
        .catch((err) => logger_1.default.error(err));
};
exports.updateDatasourceEntry = (datasourceEntry, datasourceId, datasourceToBeUpdated) => {
    return apiConfig_1.sbApi
        .put(`spaces/${spaceId}/datasource_entries/${datasourceToBeUpdated.id}`, {
        datasource_entry: {
            name: Object.values(datasourceEntry)[0],
            value: Object.values(datasourceEntry)[1],
            datasource_id: datasourceId,
            id: datasourceToBeUpdated.id
        }
    })
        .then(({ data }) => {
        return data;
    })
        .catch(err => logger_1.default.error(err));
};
exports.updateDatasource = (datasource, temp) => apiConfig_1.sbApi
    .put(`spaces/${spaceId}/datasources/${temp.id}`, {
    datasource: {
        id: temp.id,
        name: datasource.name,
        slug: datasource.slug
    }
})
    .then(({ data }) => {
    return {
        data,
        datasource_entries: datasource.datasource_entries
    };
})
    .catch(err => logger_1.default.error(err));
exports.createDatasourceEntries = (datasourceId, datasource_entries, remoteDatasourceEntries) => {
    Promise.all(datasource_entries.map((datasourceEntry) => {
        const datasourceEntriesToBeUpdated = remoteDatasourceEntries.datasource_entries.find((remoteDatasourceEntry) => remoteDatasourceEntry.name === Object.values(datasourceEntry)[0]);
        if (datasourceEntriesToBeUpdated) {
            return exports.updateDatasourceEntry(datasourceEntry, datasourceId, datasourceEntriesToBeUpdated);
        }
        else {
            return exports.createDatasourceEntry(datasourceEntry, datasourceId);
        }
    }))
        .then(({ data }) => {
        logger_1.default.success(`Datasource entries for ${datasourceId} datasource id has been successfully synced.`);
        return data;
    })
        .catch(err => logger_1.default.error(err));
};
exports.syncDatasources = async (specifiedDatasources) => {
    logger_1.default.log(`Trying to sync provided datasources: ${specifiedDatasources}`);
    const localDatasources = discover_1.findDatasources();
    const remoteDatasources = await exports.getAllDatasources();
    const filteredLocalDatasources = localDatasources.filter(datasource => {
        return specifiedDatasources.some((specifiedDatasource) => datasource.name === specifiedDatasource);
    });
    Promise.all(filteredLocalDatasources.map(datasource => {
        const datasourceToBeUpdated = remoteDatasources.datasources.find((remoteDatasource) => datasource.name === remoteDatasource.name);
        if (datasourceToBeUpdated) {
            return exports.updateDatasource(datasource, datasourceToBeUpdated);
        }
        else {
            return exports.createDatasource(datasource);
        }
    }))
        .then(res => {
        res.map(async ({ data, datasource_entries }) => {
            const remoteDatasourceEntries = await exports.getDatasourceEntries(data.datasource.name);
            exports.createDatasourceEntries(data.datasource.id, datasource_entries, remoteDatasourceEntries);
        });
        return res;
    })
        .catch(err => {
        console.log(err);
        logger_1.default.warning("There is error inside promise.all from datasource");
        return false;
    });
};
