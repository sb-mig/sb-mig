import type { IStoryblokConfig } from "../../config/config.types.js";
import type StoryblokClient from "storyblok-js-client";

import Logger from "../../utils/logger.js";

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
}

export const getAllItemsWithPagination = async ({
    apiFn,
    params,
    itemsKey,
}: GetAllItemsWithPagination) => {
    const per_page = 100;
    const allItems = [];
    let page = 1;
    let totalPages;
    let amountOfFetchedItems = 0;

    do {
        const response = await apiFn({ per_page, page, ...params });

        // Handle case where API call failed and returned undefined
        if (!response || !response.data) {
            Logger.warning(`API returned no data for ${itemsKey}`);
            return allItems;
        }

        if (!totalPages) {
            totalPages =
                Math.ceil(
                    (response.total ?? 0) / (response.perPage ?? per_page),
                ) || 1;
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
                Logger.success(
                    `${amountOfFetchedItems} of ${response.total} items fetched.`,
                );
            }
        }

        const items = response.data?.[itemsKey];
        if (Array.isArray(items)) {
            allItems.push(...items);
        }

        page++;
    } while (page <= totalPages);

    return allItems;
};
