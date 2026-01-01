export type SyncError = { name: string; message: string };

export interface SyncResult {
    created: string[];
    updated: string[];
    skipped: string[];
    errors: SyncError[];
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
