import type {
    ComponentPlan,
    DatasourcePlan,
    DestructiveChange,
} from "./sync-plan.js";

export type SyncError = {
    name: string;
    message: string;
    /** What failed: a component, a preset, a datasource entry, ... */
    scope?: string;
    /**
     * For a write that belongs to a component or a datasource (a preset, an
     * entry): that component's or datasource's name. Kept apart from `name`
     * because names may contain any character.
     */
    parent?: string;
};

export interface SyncPlan {
    components?: ComponentPlan[];
    datasources?: DatasourcePlan[];
    destructive?: DestructiveChange[];
}

export interface SyncResult {
    created: string[];
    updated: string[];
    skipped: string[];
    errors: SyncError[];
    /** What the sync changes (or, in a dry-run, would change). */
    plan?: SyncPlan;
}

export interface SyncOptions {
    dryRun?: boolean;
    /** Stop when the space cannot be listed (the CLI); see syncComponentsData. */
    strict?: boolean;
}

/**
 * Progress event emitted during sync operations
 */
export interface SyncProgressEvent {
    type: "start" | "progress" | "complete";
    /** Current item index (1-based) */
    current?: number;
    /** Total number of items */
    total?: number;
    /** Name of the component/resource being synced */
    name?: string;
    /** Action performed */
    action?:
        | "creating"
        | "updating"
        | "created"
        | "updated"
        | "skipped"
        | "error";
    /** Optional message */
    message?: string;
}

/**
 * Callback function for reporting sync progress
 */
export type SyncProgressCallback = (event: SyncProgressEvent) => void;
