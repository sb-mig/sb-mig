"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
const apiConfig_1 = require("./apiConfig");
const { spaceId } = config_1.default;
// GET
exports.getAllComponents = () => {
    logger_1.default.log("Trying to get all components.");
    return apiConfig_1.sbApi
        .get(`spaces/${spaceId}/components/`)
        .then((res) => res.data)
        .catch((err) => logger_1.default.error(err));
};
exports.getComponent = (componentName) => {
    logger_1.default.log(`Trying to get '${componentName}' component.`);
    return exports.getAllComponents()
        .then((res) => res.components.filter((component) => component.name === componentName))
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            logger_1.default.warning(`There is no component named '${componentName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => logger_1.default.error(err));
};
exports.getComponentsGroup = (groupName) => {
    logger_1.default.log(`Trying to get '${groupName}' group.`);
    return exports.getAllComponentsGroups()
        .then((res) => {
        return res.component_groups.filter((group) => group.name === groupName);
    })
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            logger_1.default.warning(`There is no group named '${groupName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => logger_1.default.error(err));
};
exports.getAllComponentsGroups = async () => {
    logger_1.default.log("Trying to get all groups.");
    return apiConfig_1.sbApi
        .get(`spaces/${spaceId}/component_groups/`)
        .then((response) => response.data)
        .catch((err) => logger_1.default.error(err));
};
exports.createComponentsGroup = (groupName) => {
    logger_1.default.log(`Trying to create '${groupName}' group`);
    return apiConfig_1.sbApi
        .post(`spaces/${spaceId}/component_groups/`, {
        component_group: {
            name: groupName,
        },
    })
        .then((res) => {
        logger_1.default.warning(`'${groupName}' created with uuid: ${res.data.component_group.uuid}`);
        return res.data;
    })
        .catch((err) => {
        logger_1.default.error(`Error happened :()`);
    });
};
