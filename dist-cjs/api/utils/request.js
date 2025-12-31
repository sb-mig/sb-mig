"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllItemsWithPagination = void 0;
const logger_js_1 = __importDefault(require("../../utils/logger.js"));
const getAllItemsWithPagination = async ({ apiFn, params, itemsKey, }) => {
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
                logger_js_1.default.success(`${amountOfFetchedItems} of ${response.total} items fetched.`);
            }
        }
        allItems.push(...response.data[itemsKey]);
        page++;
    } while (page <= totalPages);
    return allItems;
};
exports.getAllItemsWithPagination = getAllItemsWithPagination;
