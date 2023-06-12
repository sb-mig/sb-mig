import type { RequestBaseConfig } from "./utils/request.js";
import type { SyncDirection } from "../cli/sync.types.js";
import type { OneComponent } from "../utils/discover.js";

export type SyncComponents = (
    specifiedComponents: OneComponent[],
    presets: boolean,
    config: RequestBaseConfig
) => Promise<any>;

export type SyncAllComponents = (
    presets: boolean,
    config: RequestBaseConfig
) => Promise<any>;
export type SyncProvidedComponents = (
    presets: boolean,
    components: string[],
    packageName: boolean,
    config: RequestBaseConfig
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
    }: {
        transmission: SyncContent["transmission"];
        stories: any[];
        toSpaceId: string;
    },
    config: RequestBaseConfig
) => Promise<any>;

export interface SyncContent {
    type: "stories" | "assets";
    transmission: {
        from: string;
        to: string;
    };
    syncDirection: SyncDirection;
    filename?: string;
}

export type SyncContentFunction = (
    { type, transmission, syncDirection, filename }: SyncContent,
    config: RequestBaseConfig
) => Promise<any>;

export type SyncAssets = (
    { transmission }: { transmission: SyncContent["transmission"] },
    config: RequestBaseConfig
) => Promise<any>;
