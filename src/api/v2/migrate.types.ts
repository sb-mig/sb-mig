import type { RequestBaseConfig } from "./utils/request.js";
import type { OneComponent } from "../../utils/discover.js";

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
