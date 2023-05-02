export type SyncDirection =
    | "fromSpaceToFile"
    | "fromFileToSpace"
    | "fromSpaceToSpace"
    | "fromAWSToSpace";

export const defineSyncDirection = (
    fromPredicate: unknown,
    toPredicate: unknown
): SyncDirection => {
    if (Number.isNaN(fromPredicate) && !Number.isNaN(toPredicate)) {
        return "fromFileToSpace";
    } else if (!Number.isNaN(fromPredicate) && Number.isNaN(toPredicate)) {
        return "fromSpaceToFile";
    } else if (!Number.isNaN(fromPredicate) && !Number.isNaN(toPredicate)) {
        return "fromSpaceToSpace";
    } else {
        throw new Error("You cannot sync from file to file");
    }
};
