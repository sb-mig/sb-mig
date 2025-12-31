"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllRoles = getAllRoles;
exports.getRole = getRole;
exports.createRole = createRole;
exports.updateRole = updateRole;
const request_js_1 = require("../../api/utils/request.js");
async function getAllRoles(client) {
    const spaceId = client.spaceId;
    return (0, request_js_1.getAllItemsWithPagination)({
        apiFn: ({ per_page, page }) => client.sbApi.get(`spaces/${spaceId}/space_roles/`, {
            per_page,
            page,
        }),
        params: {
            spaceId,
        },
        itemsKey: "space_roles",
    });
}
async function getRole(client, roleName) {
    const roles = await getAllRoles(client);
    const match = roles.filter((r) => r.role === roleName);
    if (Array.isArray(match) && match.length === 0)
        return false;
    return match;
}
async function createRole(client, role) {
    const spaceId = client.spaceId;
    return client.sbApi
        .post(`spaces/${spaceId}/space_roles/`, { space_role: role })
        .then((res) => res.data);
}
async function updateRole(client, role) {
    const spaceId = client.spaceId;
    return client.sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
        space_role: role,
    })
        .then((res) => res.data);
}
