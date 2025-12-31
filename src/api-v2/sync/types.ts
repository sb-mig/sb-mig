export type SyncError = { name: string; message: string };

export interface SyncResult {
    created: string[];
    updated: string[];
    skipped: string[];
    errors: SyncError[];
}
