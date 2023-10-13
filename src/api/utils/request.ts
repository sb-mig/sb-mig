import type { IStoryblokConfig } from "../../config/config.js";
import type StoryblokClient from "storyblok-js-client";

import Logger from "../../utils/logger.js";

export interface RequestBaseConfig
    extends Partial<Omit<IStoryblokConfig, "sbApi">> {
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
    console.log("these are params: ");
    console.log(params);
    console.log("Itemskey: ");
    console.log(itemsKey);

    const per_page = 100;
    const allItems = [];
    let page = 1;
    let totalPages;
    let amountOfFetchedItems = 0;

    console.log("Stuff we pass: ");
    console.log({ per_page, page, ...params });

    do {
        const response = await apiFn({ per_page, page, ...params });

        console.log("This is response motherfucker: ");
        console.log(response);

        if (!totalPages) {
            totalPages = Math.ceil(response.total / response.perPage);
        }

        amountOfFetchedItems +=
            response.total - amountOfFetchedItems > per_page
                ? per_page
                : response.total - amountOfFetchedItems;

        Logger.success(
            `${amountOfFetchedItems} of ${response.total} items fetched.`,
        );

        allItems.push(...response.data[itemsKey]);

        page++;
    } while (page <= totalPages);

    return allItems;
};
