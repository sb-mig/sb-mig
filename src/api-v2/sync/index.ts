import type { ApiClient } from "../client.js";
import type { SyncProgressCallback, SyncResult } from "./types.js";

import { syncComponentsData } from "../../api/components/components.sync.js";
import { syncDatasourcesData } from "../../api/datasources/datasources.js";
import { syncPluginsData } from "../../api/plugins/plugins.js";
import { syncRolesData } from "../../api/roles/roles.js";
import { toRequestConfig } from "../requestConfig.js";

export async function syncComponents(
    client: ApiClient,
    args: {
        components: any[];
        presets?: boolean;
        ssot?: boolean;
        dryRun?: boolean;
        onProgress?: SyncProgressCallback;
    },
): Promise<SyncResult> {
    const presets = args.presets ?? false;

    return (await syncComponentsData(
        {
            components: args.components,
            presets,
            ssot: args.ssot,
            dryRun: args.dryRun,
            onProgress: args.onProgress,
        },
        toRequestConfig(client),
    )) as any;
}

export async function syncDatasources(
    client: ApiClient,
    args: { datasources: any[]; dryRun?: boolean },
): Promise<SyncResult> {
    return (await syncDatasourcesData(
        { datasources: args.datasources, dryRun: args.dryRun },
        toRequestConfig(client),
    )) as any;
}

export async function syncRoles(
    client: ApiClient,
    args: { roles: any[]; dryRun?: boolean },
): Promise<SyncResult> {
    return (await syncRolesData(
        { roles: args.roles, dryRun: args.dryRun },
        toRequestConfig(client),
    )) as any;
}

export async function syncPlugins(
    client: ApiClient,
    args: { plugins: { name: string; body: string }[]; dryRun?: boolean },
): Promise<SyncResult> {
    return (await syncPluginsData(
        { plugins: args.plugins, dryRun: args.dryRun },
        toRequestConfig(client),
    )) as any;
}
