import type { RequestBaseConfig } from "./utils/request.js";
import type { SyncDirection } from "../cli/sync.types.js";
import type { SyncOptions } from "./sync/sync.types.js";
import type { OneFileElement } from "../cli/utils/discover.js";

export type SyncComponents = (
    specifiedComponents: OneFileElement[],
    presets: boolean,
    config: RequestBaseConfig,
    options?: SyncOptions & { ssot?: boolean },
) => Promise<any>;

export type SyncAllComponents = (
    presets: boolean,
    config: RequestBaseConfig,
    options?: SyncOptions & { ssot?: boolean },
) => Promise<any>;
export type SyncProvidedComponents = (
    presets: boolean,
    components: string[],
    packageName: boolean,
    config: RequestBaseConfig,
    options?: SyncOptions,
) => Promise<any>;

// interface SyncAllComponents {
//     presets: boolean;
// }

// interface SyncProvidedComponents {
//     presets: boolean;
//     components: string[];
//     packageName: boolean;
// }

export type SyncStories = (
    {
        transmission,
        stories,
        toSpaceId,
        dryRun,
    }: {
        transmission: SyncContent["transmission"];
        stories: any[];
        toSpaceId: string;
        dryRun?: boolean;
    },
    config: RequestBaseConfig,
) => Promise<any>;

export interface SyncContent {
    type: "stories" | "assets";
    transmission: {
        from: string;
        to: string;
    };
    syncDirection: SyncDirection;
    filename?: string;
    dryRun?: boolean;
}

export type SyncContentFunction = (
    { type, transmission, syncDirection, filename, dryRun }: SyncContent,
    config: RequestBaseConfig,
) => Promise<any>;

export type SyncAssets = (
    {
        transmission,
        dryRun,
    }: {
        transmission: SyncContent["transmission"];
        syncDirection: SyncDirection;
        dryRun?: boolean;
    },
    config: RequestBaseConfig,
) => Promise<any>;
