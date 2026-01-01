// Test functions for ESM/CJS interop testing
export { testConnection, testAsyncConnection } from "./test.js";

// Client
export { createClient } from "./client.js";
export type { ClientConfig, ApiClient } from "./client.js";

// Stories
export * as stories from "./stories/index.js";
export type {
    CopyProgress,
    CopyResult,
    StoryTreeNode,
    FetchStoriesResult,
} from "./stories/types.js";

// Resources (thin wrappers)
export * as assets from "./assets/index.js";
export * as auth from "./auth/index.js";
export * as components from "./components/index.js";
export * as datasources from "./datasources/index.js";
export * as plugins from "./plugins/index.js";
export * as presets from "./presets/index.js";
export * as roles from "./roles/index.js";
export * as spaces from "./spaces/index.js";

// Sync (data-only)
export * as sync from "./sync/index.js";
export type {
    SyncResult,
    SyncError,
    SyncProgressEvent,
    SyncProgressCallback,
} from "./sync/types.js";

// Discovery
export * as discover from "./discover/index.js";
export type { DiscoveredResource } from "./discover/index.js";

// Precompile (TypeScript to JS using Rollup + SWC)
export * as precompile from "./precompile/index.js";
export type {
    PrecompileOptions,
    PrecompileResult,
} from "./precompile/index.js";
