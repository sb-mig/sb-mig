import type { ApiClient } from "../client.js";
import type { SyncResult } from "./types.js";

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
    },
): Promise<SyncResult> {
    const presets = args.presets ?? false;

    if (args.dryRun) {
        // minimal dry-run: compare names against remote
        const remote = await client.sbApi.get(
            `spaces/${client.spaceId}/components/`,
            {
                per_page: 100,
                page: 1,
            },
        );
        const remoteNames = new Set(
            (remote as any).data?.components?.map((c: any) => c.name) ?? [],
        );
        const created: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];

        for (const c of args.components) {
            const name = String(c?.name ?? "unknown");
            if (!c?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(c.name)) updated.push(name);
            else created.push(name);
        }

        return { created, updated, skipped, errors: [] };
    }

    return (await syncComponentsData(
        { components: args.components, presets, ssot: args.ssot },
        toRequestConfig(client),
    )) as any;
}

export async function syncDatasources(
    client: ApiClient,
    args: { datasources: any[]; dryRun?: boolean },
): Promise<SyncResult> {
    if (args.dryRun) {
        const remote = await client.sbApi.get(
            `spaces/${client.spaceId}/datasources/`,
        );
        const remoteNames = new Set(
            (remote as any).data?.datasources?.map((d: any) => d.name) ?? [],
        );
        const created: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];

        for (const d of args.datasources) {
            const name = String(d?.name ?? "unknown");
            if (!d?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(d.name)) updated.push(name);
            else created.push(name);
        }

        return { created, updated, skipped, errors: [] };
    }

    return (await syncDatasourcesData(
        { datasources: args.datasources },
        toRequestConfig(client),
    )) as any;
}

export async function syncRoles(
    client: ApiClient,
    args: { roles: any[]; dryRun?: boolean },
): Promise<SyncResult> {
    if (args.dryRun) {
        const remote = await client.sbApi.get(
            `spaces/${client.spaceId}/space_roles/`,
            {
                per_page: 100,
                page: 1,
            },
        );
        const remoteNames = new Set(
            (remote as any).data?.space_roles?.map((r: any) => r.role) ?? [],
        );
        const created: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];

        for (const r of args.roles) {
            const name = String(r?.role ?? "unknown");
            if (!r?.role) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(r.role)) updated.push(name);
            else created.push(name);
        }

        return { created, updated, skipped, errors: [] };
    }

    return (await syncRolesData(
        { roles: args.roles },
        toRequestConfig(client),
    )) as any;
}

export async function syncPlugins(
    client: ApiClient,
    args: { plugins: { name: string; body: string }[]; dryRun?: boolean },
): Promise<SyncResult> {
    if (args.dryRun) {
        const remote = await client.sbApi.get("field_types", {
            per_page: 100,
            page: 1,
        });
        const remoteNames = new Set(
            (remote as any).data?.field_types?.map((p: any) => p.name) ?? [],
        );
        const created: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];

        for (const p of args.plugins) {
            const name = String(p?.name ?? "unknown");
            if (!p?.name) {
                skipped.push(name);
                continue;
            }
            if (remoteNames.has(p.name)) updated.push(name);
            else created.push(name);
        }

        return { created, updated, skipped, errors: [] };
    }

    return (await syncPluginsData(
        { plugins: args.plugins },
        toRequestConfig(client),
    )) as any;
}
