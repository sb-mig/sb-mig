import type { GetAllInternalTags } from "./internal-tags.types.js";

import Logger from "../../utils/logger.js";
import { getAllItemsWithPagination } from "../utils/request.js";

/**
 * The internal tags of one object type.
 *
 * `by_object_type` is not optional here, and not a filter for convenience: the
 * same path without it answers 403 "This endpoint does not support this token
 * type" to every personal access token, while with it the read is allowed.
 */
export const getAllInternalTags: GetAllInternalTags = async (args, config) => {
    const { spaceId, objectType, search } = args;
    const { sbApi } = config;

    const internalTags = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            (sbApi as any)
                .get(`spaces/${spaceId}/internal_tags/`, {
                    by_object_type: objectType,
                    ...(search ? { search } : {}),
                    per_page,
                    page,
                })
                .catch((err: any) => {
                    if (err.response?.status === 404) {
                        Logger.error(
                            `There are no internal tags in your Storyblok ${spaceId} space.`,
                        );
                        return {
                            data: { internal_tags: [] },
                            total: 0,
                            perPage: 100,
                        };
                    }

                    Logger.error(err);
                    throw err;
                }),
        params: {},
        itemsKey: "internal_tags",
    });

    return { internal_tags: internalTags };
};
