"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSpace = exports.getAllSpaces = exports.getSpace = void 0;
const getSpace = (args, config) => {
    const { sbApi } = config;
    const { spaceId } = args;
    return sbApi
        .get(`spaces/${spaceId}`)
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.getSpace = getSpace;
const getAllSpaces = (config) => {
    const { sbApi } = config;
    return sbApi
        .get(`spaces/`)
        .then((res) => res.data.spaces)
        .catch((err) => {
        console.error(err);
        return [];
    });
};
exports.getAllSpaces = getAllSpaces;
const updateSpace = (args, config) => {
    const { sbApi } = config;
    const { spaceId, params } = args;
    return sbApi
        .put(`spaces/${spaceId}`, {
        ...params,
    })
        .then((res) => res.data)
        .catch((err) => console.error(err));
};
exports.updateSpace = updateSpace;
