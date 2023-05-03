import type StoryblokClient from "storyblok-js-client";

import Logger from "../../utils/logger.js";

import { getAllItemsWithPagination } from "./utils/request.js";

interface RequestBaseConfig {
    spaceId: string;
    sbApi: StoryblokClient;
}

/*
 *
 * GET ALL components
 *
 * */
export const getAllComponents = (config: RequestBaseConfig) => {
    const { spaceId, sbApi } = config;
    Logger.log("Trying to get all components.");

    return getAllItemsWithPagination({
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/components/`, { per_page, page })
                .then((res) => {
                    Logger.log(`Amount of components: ${res.total}`);

                    return res;
                })
                .catch((err: any) => console.error(err)),
        params: {
            spaceId,
        },
        itemsKey: "components",
    });
};

/*
 *
 * GET ONE component
 *
 * */
export const getComponent = (
    componentName: string | undefined,
    config: RequestBaseConfig
) => {
    Logger.log(`Trying to get '${componentName}' component.`);

    return getAllComponents(config)
        .then((res) =>
            res.filter((component: any) => component.name === componentName)
        )
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                console.info(`There is no component named '${componentName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => console.error(err));
};
