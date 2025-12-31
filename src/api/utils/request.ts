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

        if (!totalPages) {
            totalPages = Math.ceil(response.total / response.perPage);
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

        allItems.push(...response.data[itemsKey]);

        page++;
    } while (page <= totalPages);

    return allItems;
};
