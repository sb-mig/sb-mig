import storyblokConfig from "../config/config.js";
import Logger from "../utils/logger.js";

import { sbApi } from "./config.js";
import { getAllItemsWithPagination } from "./stories.js";

const { spaceId } = storyblokConfig;

// DELETE
export const removeComponent = ({ component }: { component: any }) => {
    const { id, name } = component;
    console.log(`Removing '${name}' component.`);

    return sbApi
        .delete(`spaces/${spaceId}/components/${id}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const removeComponentGroup = ({
    componentGroup,
}: {
    componentGroup: any;
}) => {
    const { id, name } = componentGroup;

    console.log(`Removing '${name}' component group.`);

    return sbApi
        .delete(`spaces/${spaceId}/component_groups/${id}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

// GET
export const getAllComponents = () => {
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

// GET
export const getAllPlugins = () => {
    console.log("Trying to get all plugins.");

    return sbApi
        .get(`field_types`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const getComponent = (componentName: string | undefined) => {
    console.log(`Trying to get '${componentName}' component.`);

    return getAllComponents()
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
