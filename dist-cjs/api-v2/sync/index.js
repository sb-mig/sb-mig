"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncComponents = syncComponents;
exports.syncDatasources = syncDatasources;
exports.syncRoles = syncRoles;
exports.syncPlugins = syncPlugins;
const components_sync_js_1 = require("../../api/components/components.sync.js");
const datasources_js_1 = require("../../api/datasources/datasources.js");
const plugins_js_1 = require("../../api/plugins/plugins.js");
const roles_js_1 = require("../../api/roles/roles.js");
const requestConfig_js_1 = require("../requestConfig.js");
async function syncComponents(client, args) {
    const presets = args.presets ?? false;
    if (args.dryRun) {
        // minimal dry-run: compare names against remote
        const remote = await client.sbApi.get(`spaces/${client.spaceId}/components/`, {
            per_page: 100,
            page: 1,
        });
        const remoteNames = new Set(remote.data?.components?.map((c) => c.name) ?? []);
        const created = [];
        const updated = [];
        const skipped = [];
        for (const c of args.components) {
            const name = String(c?.name ?? "unknown");
            if (!c?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(c.name))
                updated.push(name);
            else
                created.push(name);
        }
        return { created, updated, skipped, errors: [] };
    }
    return (await (0, components_sync_js_1.syncComponentsData)({ components: args.components, presets, ssot: args.ssot }, (0, requestConfig_js_1.toRequestConfig)(client)));
}
async function syncDatasources(client, args) {
    if (args.dryRun) {
        const remote = await client.sbApi.get(`spaces/${client.spaceId}/datasources/`);
        const remoteNames = new Set(remote.data?.datasources?.map((d) => d.name) ?? []);
        const created = [];
        const updated = [];
        const skipped = [];
        for (const d of args.datasources) {
            const name = String(d?.name ?? "unknown");
            if (!d?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(d.name))
                updated.push(name);
            else
                created.push(name);
        }
        return { created, updated, skipped, errors: [] };
    }
    return (await (0, datasources_js_1.syncDatasourcesData)({ datasources: args.datasources }, (0, requestConfig_js_1.toRequestConfig)(client)));
}
async function syncRoles(client, args) {
    if (args.dryRun) {
        const remote = await client.sbApi.get(`spaces/${client.spaceId}/space_roles/`, {
            per_page: 100,
            page: 1,
        });
        const remoteNames = new Set(remote.data?.space_roles?.map((r) => r.role) ?? []);
        const created = [];
        const updated = [];
        const skipped = [];
        for (const r of args.roles) {
            const name = String(r?.role ?? "unknown");
            if (!r?.role) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(r.role))
                updated.push(name);
            else
                created.push(name);
        }
        return { created, updated, skipped, errors: [] };
    }
    return (await (0, roles_js_1.syncRolesData)({ roles: args.roles }, (0, requestConfig_js_1.toRequestConfig)(client)));
}
async function syncPlugins(client, args) {
    if (args.dryRun) {
        const remote = await client.sbApi.get("field_types", {
            per_page: 100,
            page: 1,
        });
        const remoteNames = new Set(remote.data?.field_types?.map((p) => p.name) ?? []);
        const created = [];
        const updated = [];
        const skipped = [];
        for (const p of args.plugins) {
            const name = String(p?.name ?? "unknown");
            if (!p?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(p.name))
                updated.push(name);
            else
                created.push(name);
        }
        return { created, updated, skipped, errors: [] };
    }
    return (await (0, plugins_js_1.syncPluginsData)({ plugins: args.plugins }, (0, requestConfig_js_1.toRequestConfig)(client)));
}
