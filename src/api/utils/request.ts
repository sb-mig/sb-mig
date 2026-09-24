import type { IStoryblokConfig } from "../../config/config.types.js";
import type StoryblokClient from "storyblok-js-client";

import Logger from "../../utils/logger.js";
import {
    describeRetryReason,
    retryAttemptsOf,
    withRetry,
} from "../../utils/retry.js";

export interface RequestBaseConfig extends Partial<
    Omit<IStoryblokConfig, "sbApi">
> {
    spaceId: string;
    sbApi: StoryblokClient;
}

interface GetAllItemsWithPagination {
    apiFn: (...args: any) => any;
    params: any;
    itemsKey: string;
    /**
     * Silence the per-page heartbeat. A caller that shows its own progress
     * asks for this; a caller that passes nothing keeps today's lines.
     */
    quiet?: boolean;
    /** Told how far the listing has come, for a caller with a progress line. */
    onPage?: (progress: { fetched: number; total: number }) => void;
    /** The pauses between attempts of one page and how to wait them (tests). */
    retry?: {
        delays?: readonly number[];
        sleep?: (ms: number) => Promise<void>;
    };
}

/** One full pass over a listing, and what it says about itself. */
type ListingRead = {
    items: any[];
    /** The `total` the first page reported; undefined when the endpoint sends none. */
    total: number | undefined;
    distinct: number;
    repeated: number;
};

/**
 * The identity of a listed item. Every Storyblok resource listed here has a
 * numeric `id`; an item without one takes no part in the shift checks.
 */
const idOf = (item: any): unknown =>
    item !== null && typeof item === "object" ? item.id : undefined;

const countIds = (items: any[]) => {
    const seen = new Set<unknown>();
    let repeated = 0;

    for (const item of items) {
        const id = idOf(item);

        if (id === undefined || id === null) {
            continue;
        }

        if (seen.has(id)) {
            repeated += 1;
        } else {
            seen.add(id);
        }
    }

    return { distinct: seen.size, repeated };
};

/**
 * A read that shifted under us: an item seen twice (something was inserted
 * before it while the pages were read), or fewer distinct items than the
 * first page announced (something was deleted and a later page skipped one).
 * An endpoint without `total` keeps the repeat check only.
 */
const hasShifted = (read: ListingRead): boolean =>
    read.repeated > 0 ||
    (read.total !== undefined && read.distinct < read.total);

const readListingOnce = async ({
    apiFn,
    params,
    itemsKey,
    quiet,
    onPage,
    retry,
}: GetAllItemsWithPagination): Promise<ListingRead> => {
    const per_page = 100;
    const allItems: any[] = [];
    let page = 1;
    let totalPages: number | undefined;
    let total: number | undefined;
    let amountOfFetchedItems = 0;
    const subject =
        params?.spaceId !== undefined ? `space ${params.spaceId}` : itemsKey;

    do {
        const currentPage = page;
        const failure = (cause: string) =>
            new Error(
                `Listing ${itemsKey} failed on page ${currentPage} of ${totalPages ?? "?"}: ${cause}`,
            );

        let response: any;

        try {
            response = await withRetry(
                async () => apiFn({ per_page, page: currentPage, ...params }),
                {
                    step: `listing ${itemsKey} page ${currentPage}`,
                    subject,
                    onRetry: (line) => Logger.warning(line),
                    ...(retry?.delays ? { delays: retry.delays } : {}),
                    ...(retry?.sleep ? { sleep: retry.sleep } : {}),
                },
            );
        } catch (error) {
            const attempts = retryAttemptsOf(error);

            throw Object.assign(
                failure(
                    `${describeRetryReason(error)}${attempts && attempts > 1 ? ` (after ${attempts} attempts)` : ""}`,
                ),
                { cause: error },
            );
        }

        // A page without data is never "the end of the list": returning what
        // was collected so far would hand every caller a partial list as if
        // it were the whole space (MAR-3139).
        if (!response || !response.data) {
            throw failure("the response carried no data");
        }

        if (!totalPages) {
            totalPages =
                Math.ceil(
                    (response.total ?? 0) / (response.perPage ?? per_page),
                ) || 1;
            total =
                typeof response.total === "number" ? response.total : undefined;
        }

        /**
         *
         * Not every endpoint in storyblok give us pagination...
         * so only for this who paginate we want to calculate values to show
         *
         * */
        if (response.total) {
            amountOfFetchedItems +=
                response.total - amountOfFetchedItems > per_page
                    ? per_page
                    : response.total - amountOfFetchedItems;

            if (amountOfFetchedItems && !Number.isNaN(amountOfFetchedItems)) {
                onPage?.({
                    fetched: amountOfFetchedItems,
                    total: response.total,
                });

                if (!quiet) {
                    Logger.success(
                        `${amountOfFetchedItems} of ${response.total} items fetched.`,
                    );
                }
            }
        }

        const items = response.data?.[itemsKey];
        if (Array.isArray(items)) {
            allItems.push(...items);
        }

        page++;
    } while (page <= totalPages);

    return { items: allItems, total, ...countIds(allItems) };
};

/**
 * Every item of a listing, or an error — never a partial list.
 *
 * - A page that fails for a transient reason is retried (`withRetry`).
 * - A page that still fails, or answers without data, throws with the
 *   resource, the page and the cause.
 * - A listing that shifted while it was read (an item repeated or skipped)
 *   is read once more; a clean first read is never read twice. If the second
 *   read is not consistent either, it throws.
 */
export const getAllItemsWithPagination = async (
    options: GetAllItemsWithPagination,
) => {
    const first = await readListingOnce(options);

    if (!hasShifted(first)) {
        return first.items;
    }

    Logger.warning(
        `Listing ${options.itemsKey} changed while it was read (got ${first.distinct} distinct of ${first.total ?? "?"}, ${first.repeated} repeated); reading it again.`,
    );

    const second = await readListingOnce(options);

    if (hasShifted(second)) {
        throw new Error(
            `Listing ${options.itemsKey} changed while it was read (got ${second.distinct} distinct of ${second.total ?? "?"}, ${second.repeated} repeated)`,
        );
    }

    return second.items;
};
