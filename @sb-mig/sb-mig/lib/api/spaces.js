"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const apiConfig_1 = require("./apiConfig");
// CREATE
exports.createSpace = (spaceName) => {
    logger_1.default.warning(`Trying to create space ${spaceName}...`);
    return apiConfig_1.sbApi
        .post(`spaces/`, {
        space: {
            name: spaceName,
            domain: 'http://localhost:8000/editor?path='
        }
    })
        .then(res => {
        return res;
    })
        .catch(err => {
        logger_1.default.error(`Error happened. Can't create space`);
        console.log(err.message);
    });
};
// GET
exports.getSpace = (spaceId) => {
    return apiConfig_1.sbApi.get(`spaces/${spaceId}`).then(res => res);
};
