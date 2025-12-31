"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAccessToSpace = exports.getCurrentUser = void 0;
const spaces_js_1 = require("../spaces/spaces.js");
const getCurrentUser = async (config) => {
    const { sbApi } = config;
    console.log("Trying to get current user current OAuthToken");
    const currentUser = await sbApi
        .get(`users/me`, {
        per_page: 100,
    })
        .then((res) => {
        return res.data.user;
    })
        .catch((err) => {
        console.error(err);
        return err;
    });
    return currentUser;
};
exports.getCurrentUser = getCurrentUser;
const hasAccessToSpace = async (args, config) => {
    const { spaceId } = args;
    const allSpaces = await (0, spaces_js_1.getAllSpaces)(config);
    const hasAccess = allSpaces.find((space) => Number(space.id) === Number(spaceId));
    return !!hasAccess;
};
exports.hasAccessToSpace = hasAccessToSpace;
