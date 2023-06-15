import type { RequestBaseConfig } from "../utils/request.js";

export type UpdatePresets = (
    args: { presets: any; options: { publish?: boolean }; spaceId: string },
    config: RequestBaseConfig
) => Promise<any>;

export type UpdatePreset = (
    args: { p: any },
    config: RequestBaseConfig
) => Promise<any>;

export type GetPresetById = (
    args: { presetId: string | undefined },
    config: RequestBaseConfig
) => Promise<any>;
