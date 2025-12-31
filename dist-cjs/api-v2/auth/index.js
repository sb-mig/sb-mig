"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = getCurrentUser;
exports.hasAccessToSpace = hasAccessToSpace;
const auth_js_1 = require("../../api/auth/auth.js");
const requestConfig_js_1 = require("../requestConfig.js");
async function getCurrentUser(client) {
    return await (0, auth_js_1.getCurrentUser)((0, requestConfig_js_1.toRequestConfig)(client));
}
async function hasAccessToSpace(client, spaceId) {
    return await (0, auth_js_1.hasAccessToSpace)({ spaceId }, (0, requestConfig_js_1.toRequestConfig)(client));
}
