import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";

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
    console.log("Trying to get all components.");

    return sbApi
        .get(`spaces/${spaceId}/components/`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
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
            res.components.filter(
                (component: any) => component.name === componentName
            )
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

export const getComponentsGroup = (groupName: string | undefined) => {
    console.log(`Trying to get '${groupName}' group.`);

    return getAllComponentsGroups()
        .then((res) => {
            return res.component_groups.filter(
                (group: any) => group.name === groupName
            );
        })
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                console.info(`There is no group named '${groupName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => console.error(err));
};

export const getAllComponentsGroups = async () => {
    console.log("Trying to get all groups.");

    return sbApi
        .get(`spaces/${spaceId}/component_groups/`)
        .then((response) => response.data)
        .catch((err) => console.error(err));
};

export const createComponentsGroup = (groupName: string) => {
    console.log(`Trying to create '${groupName}' group`);
    return sbApi
        .post(`spaces/${spaceId}/component_groups/`, {
            component_group: {
                name: groupName,
            },
        } as any)
        .then((res: any) => {
            console.info(
                `'${groupName}' created with uuid: ${res.data.component_group.uuid}`
            );
            return res.data;
        })
        .catch((err: any) => {
            console.log(err.message);
            console.error("Error happened :()");
        });
};
