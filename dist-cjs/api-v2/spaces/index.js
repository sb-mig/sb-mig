"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSpaces = getAllSpaces;
exports.getSpace = getSpace;
exports.updateSpace = updateSpace;
const spaces_js_1 = require("../../api/spaces/spaces.js");
const requestConfig_js_1 = require("../requestConfig.js");
async function getAllSpaces(client) {
    return await (0, spaces_js_1.getAllSpaces)((0, requestConfig_js_1.toRequestConfig)(client));
}
async function getSpace(client, spaceId) {
    return await (0, spaces_js_1.getSpace)({ spaceId }, (0, requestConfig_js_1.toRequestConfig)(client));
}
async function updateSpace(client, args) {
    return await (0, spaces_js_1.updateSpace)(args, (0, requestConfig_js_1.toRequestConfig)(client));
}
