import type { RequestBaseConfig } from "./utils/request.js";

interface Plugin {
    id: number;
    name: string;
}

interface UpdatePluginDTO {
    plugin: Plugin;
    body?: string;
}

interface SyncProvidedPluginsDTO {
    plugins: string[];
}

export type GetPlugin = (
    pluginName: string | undefined,
    config: RequestBaseConfig
) => Promise<any>;
export type GetAllPlugins = (config: RequestBaseConfig) => Promise<any>;
export type GetPluginDetails = (
    plugin: Plugin,
    config: RequestBaseConfig
) => Promise<any>;

export type UpdatePlugin = (
    plugin: UpdatePluginDTO,
    config: RequestBaseConfig
) => Promise<any>;
export type CreatePlugin = (
    pluginName: string,
    config: RequestBaseConfig
) => Promise<any>;

export type SyncProvidedPlugins = (
    plugin: SyncProvidedPluginsDTO,
    config: RequestBaseConfig
) => Promise<void>;
