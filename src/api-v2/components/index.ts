import type { ApiClient } from "../client.js";

import {
    createComponent as apiCreateComponent,
    getAllComponents as apiGetAllComponents,
    getComponent as apiGetComponent,
    getAllComponentsGroups as apiGetAllComponentsGroups,
    createComponentsGroup as apiCreateComponentsGroup,
    getComponentsGroup as apiGetComponentsGroup,
    removeComponent as apiRemoveComponent,
    removeComponentGroup as apiRemoveComponentGroup,
    updateComponent as apiUpdateComponent,
} from "../../api/components/components.js";
import { toRequestConfig } from "../requestConfig.js";

export async function getAllComponents(client: ApiClient): Promise<any[]> {
    return await apiGetAllComponents(toRequestConfig(client));
}

export async function getComponent(
    client: ApiClient,
    componentName: string,
): Promise<any> {
    return await apiGetComponent(componentName, toRequestConfig(client));
}

export async function getAllComponentsGroups(
    client: ApiClient,
): Promise<any[]> {
    return await apiGetAllComponentsGroups(toRequestConfig(client));
}

export async function getComponentsGroup(
    client: ApiClient,
    groupName: string,
): Promise<any> {
    return await apiGetComponentsGroup(groupName, toRequestConfig(client));
}

export async function createComponentsGroup(
    client: ApiClient,
    groupName: string,
): Promise<any> {
    return await apiCreateComponentsGroup(groupName, toRequestConfig(client));
}

export async function removeComponentGroup(
    client: ApiClient,
    componentGroup: any,
): Promise<any> {
    return await apiRemoveComponentGroup(
        componentGroup,
        toRequestConfig(client),
    );
}

export async function removeComponent(
    client: ApiClient,
    component: any,
): Promise<any> {
    return await apiRemoveComponent(component, toRequestConfig(client));
}

export async function createComponent(
    client: ApiClient,
    component: any,
    presets = false,
): Promise<any> {
    return await apiCreateComponent(
        component,
        presets,
        toRequestConfig(client),
    );
}

export async function updateComponent(
    client: ApiClient,
    component: any,
    presets = false,
): Promise<any> {
    return await apiUpdateComponent(
        component,
        presets,
        toRequestConfig(client),
    );
}
