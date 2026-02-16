import type { ApiClient } from "../client.js";

import { getComponentPresets as apiGetComponentPresets } from "../../api/presets/componentPresets.js";
import {
    getAllPresets as apiGetAllPresets,
    getPreset as apiGetPreset,
    createPreset as apiCreatePreset,
    updatePreset as apiUpdatePreset,
    updatePresets as apiUpdatePresets,
} from "../../api/presets/presets.js";
import { toRequestConfig } from "../requestConfig.js";

export async function getAllPresets(client: ApiClient): Promise<any> {
    return await apiGetAllPresets(toRequestConfig(client));
}

export async function getPreset(
    client: ApiClient,
    presetId: string,
): Promise<any> {
    return await apiGetPreset({ presetId }, toRequestConfig(client));
}

export async function createPreset(
    client: ApiClient,
    preset: any,
): Promise<any> {
    return await apiCreatePreset(preset, toRequestConfig(client));
}

export async function updatePreset(
    client: ApiClient,
    preset: any,
): Promise<any> {
    return await apiUpdatePreset({ p: preset }, toRequestConfig(client));
}

export async function updatePresets(
    client: ApiClient,
    args: { presets: any[]; spaceId: string; options?: { publish?: boolean } },
): Promise<any> {
    return await apiUpdatePresets(
        {
            presets: args.presets,
            spaceId: args.spaceId,
            options: args.options ?? {},
        },
        toRequestConfig(client),
    );
}

export async function getComponentPresets(
    client: ApiClient,
    componentName: string,
): Promise<any> {
    return await apiGetComponentPresets(componentName, toRequestConfig(client));
}
