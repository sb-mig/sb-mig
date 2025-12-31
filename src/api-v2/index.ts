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

// Discovery
export * as discover from "./discover/index.js";
export type { DiscoveredResource } from "./discover/index.js";

// Re-export managementApi for advanced use cases
export { managementApi } from "../api/managementApi.js";
