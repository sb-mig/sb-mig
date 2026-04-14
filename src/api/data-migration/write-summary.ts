export interface MutationWriteResult {
    ok: boolean;
    id?: number | string;
    name?: string;
    slug?: string;
    error?: unknown;
}

export interface MutationWriteSummary {
    total: number;
    successful: number;
    failed: number;
    failedItems: MutationWriteResult[];
}

export const summarizeMutationWriteResults = (
    results: PromiseSettledResult<MutationWriteResult>[],
): MutationWriteSummary => {
    const failedItems: MutationWriteResult[] = [];
    let successful = 0;

    for (const result of results) {
        if (result.status === "fulfilled" && result.value?.ok) {
            successful++;
            continue;
        }

        if (result.status === "fulfilled") {
            failedItems.push(
                result.value || {
                    ok: false,
                },
            );
            continue;
        }

        failedItems.push({
            ok: false,
            error: result.reason,
        });
    }

    return {
        total: results.length,
        successful,
        failed: failedItems.length,
        failedItems,
    };
};
