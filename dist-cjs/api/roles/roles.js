"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncRolesData = exports.getRole = exports.getAllRoles = exports.updateRole = exports.createRole = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const request_js_1 = require("../utils/request.js");
// POST
const createRole = (role, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .post(`spaces/${spaceId}/space_roles/`, {
        space_role: role,
    })
        .then(() => {
        logger_js_1.default.success(`Role '${role.role}' has been created.`);
    })
        .catch((err) => {
        logger_js_1.default.error("error happened... :(");
        console.log(`${err.message} in migration of ${role.role} in createRole function`);
        throw err;
    });
};
exports.createRole = createRole;
// PUT
const updateRole = (role, config) => {
    const { sbApi, spaceId } = config;
    return sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
        space_role: role,
    })
        .then(() => {
        logger_js_1.default.success(`Role '${role.role}' has been updated.`);
    })
        .catch((err) => {
        logger_js_1.default.error("error happened... :(");
        console.log(`${err.message} in migration of ${role.role} in updateRole function`);
        throw err;
    });
};
exports.updateRole = updateRole;
// GET
const getAllRoles = async (config) => {
    const { sbApi, spaceId } = config;
    logger_js_1.default.log("Trying to get all roles.");
    // TODO: All Roles doesnt support pagination...
    // https://github.com/storyblok/storyblok-js-client/issues/535
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => sbApi
            .get(`spaces/${spaceId}/space_roles/`, { per_page, page })
            .then((res) => {
            logger_js_1.default.log(`Amount of roles: ${res.total}`);
            return res;
        })
            .catch((err) => {
            if (err.response.status === 404) {
                logger_js_1.default.error(`There is no roles in your Storyblok ${spaceId} space.`);
                return true;
            }
            else {
                logger_js_1.default.error(err);
                return false;
            }
        }),
        params: {
            spaceId,
        },
        itemsKey: "space_roles",
    });
};
exports.getAllRoles = getAllRoles;
// GET
const getRole = async (roleName, config) => {
    logger_js_1.default.log(`Trying to get '${roleName}' role.`);
    return (0, exports.getAllRoles)(config)
        .then((res) => res.filter((role) => role.role === roleName))
        .then((res) => {
        if (Array.isArray(res) && res.length === 0) {
            logger_js_1.default.warning(`There is no role named '${roleName}'`);
            return false;
        }
        return res;
    })
        .catch((err) => logger_js_1.default.error(err));
};
exports.getRole = getRole;
const syncRolesData = async ({ roles }, config) => {
    const result = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
    };
    const space_roles_raw = await (0, exports.getAllRoles)(config);
    const space_roles = Array.isArray(space_roles_raw) ? space_roles_raw : [];
    const rolesToUpdate = [];
    const rolesToCreate = [];
    for (const role of roles) {
        if (!role || typeof role !== "object" || !("role" in role)) {
            result.skipped.push(String(role?.role ?? "unknown"));
            continue;
        }
        const shouldBeUpdated = space_roles.find((remoteRole) => role.role === remoteRole.role);
        if (shouldBeUpdated) {
            rolesToUpdate.push({ id: shouldBeUpdated.id, ...role });
        }
        else {
            rolesToCreate.push(role);
        }
    }
    const updateResults = await Promise.allSettled(rolesToUpdate.map((role) => (0, exports.updateRole)(role, config)));
    updateResults.forEach((r, idx) => {
        const name = String(rolesToUpdate[idx]?.role ?? "unknown");
        if (r.status === "fulfilled")
            result.updated.push(name);
        else
            result.errors.push({ name, message: String(r.reason) });
    });
    const createResults = await Promise.allSettled(rolesToCreate.map((role) => (0, exports.createRole)(role, config)));
    createResults.forEach((r, idx) => {
        const name = String(rolesToCreate[idx]?.role ?? "unknown");
        if (r.status === "fulfilled")
            result.created.push(name);
        else
            result.errors.push({ name, message: String(r.reason) });
    });
    return result;
};
exports.syncRolesData = syncRolesData;
// File-based sync wrapper lives in `roles.sync.ts` to keep this module CJS-safe.
