import type { ComponentWhitelistSimpleResolver } from "./resolvers.types.js";
import type { StoryblokComponentSchemaBase } from "storyblok-schema-types";

import {
    discoverResolvers,
    LOOKUP_TYPE,
    SCOPE,
} from "../../cli/utils/discover.js";
import config from "../../config/config.js";
import { getFileContentWithRequire } from "../../utils/main.js";

type ComponentData = {
    [K in keyof StoryblokComponentSchemaBase<any>]: any;
};

export interface ResolversBy {
    match: string[];
    componentData: Partial<ComponentData>;
}

export interface SchemaGlobalResolvers {
    all?: Omit<ResolversBy, "match">;
    byPluginNames?: ResolversBy[];
    byComponentGroupNames?: ResolversBy[];
    byComponentNames?: ResolversBy[];
}

export const transformWithResolverFiles = async (componentsContent: any) => {
    componentsContent = structuredClone(componentsContent);
    const resolversFilenames = await discoverResolvers({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    /*
     * if resolversFilenames exist, then do stuff if not, than follow with the old approach
     * */
    if (resolversFilenames.length !== 0) {
        const resolverFilesContent = await Promise.all(
            // TODO: change to allSettled
            resolversFilenames.map((filename) => {
                return getFileContentWithRequire({ file: filename });
            }),
        );

        componentsContent = resolverTransformations(
            componentsContent,
            resolverFilesContent[0],
        );
    }

    return componentsContent;
};

const isContentAvailableAsBloks = (component: any) =>
    "content" in component.schema &&
    component.schema.content.component_whitelist &&
    component.schema.content.type === "bloks";

const isItemsAvailableAsBloks = (component: any) =>
    "items" in component.schema &&
    component.schema.items.component_whitelist &&
    component.schema.items.type === "bloks";

const updateComponentWhitelist = ({
    component,
    update,
}: {
    component: any;
    update: ComponentWhitelistSimpleResolver;
}) => {
    if (isContentAvailableAsBloks(component)) {
        component.schema.content.component_whitelist = [
            ...new Set(update(component.schema.content.component_whitelist)), // make sure it will have unique items
        ];
    } else if (isItemsAvailableAsBloks(component)) {
        component.schema.items.component_whitelist = [
            ...new Set(update(component.schema.items.component_whitelist)), // make sure it will have unique items
        ];
    }
};

export const transformWithMainConfigFile = (componentsContent: any) => {
    componentsContent = structuredClone(componentsContent);

    if (config.resolvers && config.resolvers.length > 0) {
        config.resolvers.map((resolver) => {
            componentsContent = componentsContent.map((component: any) => {
                // If the component that we try to sync is in resolved component names list to resolve / transform
                if (resolver.match.includes(component.name)) {
                    if (resolver.fields.component_whitelist) {
                        updateComponentWhitelist({
                            component,
                            update: resolver.fields.component_whitelist,
                        });
                    }
                    if (resolver.fields.translatable) {
                        component.schema.icon.translatable =
                            resolver.fields.translatable(
                                component.schema.icon.translatable,
                            );
                    }
                }

                return component;
            });
        });
    }

    if (config.advancedResolvers) {
        componentsContent = resolverTransformations(
            componentsContent,
            config.advancedResolvers,
        );
    }

    return componentsContent;
};

/**
 * side effect: true
 */
export const resolveGlobalTransformations = async (componentsContent: any) => {
    componentsContent = await transformWithResolverFiles(componentsContent);
    componentsContent = await transformWithMainConfigFile(componentsContent);

    return componentsContent;
};

const extendField = (obj: any, targetField: string, newValue: any) => {
    if (typeof obj !== "object" || obj === null) {
        return false;
    }

    if (obj.hasOwnProperty(targetField)) {
        if (Array.isArray(obj[targetField])) {
            for (const element of newValue) {
                if (!obj[targetField].includes(element)) {
                    obj[targetField] = [...obj[targetField], element];
                }
            }
        } else if (typeof obj[targetField] === "object") {
            // this is something i have to fix, comparing to object is stupid
            obj[targetField] = { ...obj[targetField], ...newValue };
        }

        return true;
    }

    for (const key in obj) {
        if (extendField(obj[key], targetField, newValue)) {
            return true;
        }
    }

    return false;
};

const resolveAll = (resolver: any, componentsContent: any[]) => {
    if (!resolver.all) return componentsContent;

    return componentsContent;
};

export const extendFields = (componentNamesResolver: any, component: any) => {
    const targetField = Object.keys(
        componentNamesResolver.methods.extend,
    )[0] as string;
    console.log("This is target field ?");
    console.log(targetField);
    extendField(
        component,
        targetField,
        componentNamesResolver.methods.extend[targetField],
    );
};

function deepTransform(obj: any, transformers: any): any {
    if (typeof obj !== "object" || obj === null) {
        return obj;
    }

    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in transformers) {
        if (typeof transformers[key] === "function") {
            result[key] = transformers[key](obj[key]);
        } else if (
            typeof transformers[key] === "object" &&
            transformers[key] !== null
        ) {
            result[key] = deepTransform(obj[key] || {}, transformers[key]);
        } else {
            result[key] = transformers[key];
        }
    }

    // Preserve untransformed properties
    for (const key in obj) {
        if (!(key in transformers)) {
            result[key] = obj[key];
        }
    }

    return result;
}

export const resolverTransformations = (
    componentsContent: any,
    resolverFilesContent: any,
) => {
    let resolvedComponents = [];

    resolvedComponents = resolveComponentNames(
        resolverFilesContent,
        componentsContent,
    );

    /**
     *
     * TODO: implement this
     *
     * */
    // resolvedComponents = resolveComponentGroupNames(
    //     resolver,
    //     resolvedComponents,
    // );
    // resolvedComponents = resolvePluginNames(resolver, resolvedComponents);

    return resolvedComponents;
};

const resolveComponentNames = (
    resolver: SchemaGlobalResolvers,
    componentsContent: any[],
) => {
    if (!resolver.byComponentNames) return componentsContent;

    componentsContent = structuredClone(componentsContent);

    resolver.byComponentNames.map((componentNameResolver) => {
        componentsContent = componentsContent.map((component: any) => {
            // If the component that we try to sync is in resolved component names list to resolve / transform
            if (
                componentNameResolver &&
                componentNameResolver.match.includes(component.name)
            ) {
                const changedObj = deepTransform(
                    component,
                    componentNameResolver.componentData,
                );
                component = changedObj;
            }

            return component;
        });
    });

    return componentsContent;
};

const resolvePluginNames = (resolver: any, componentsContent: any[]) => {
    if (!resolver.componentPluginNames) return componentsContent;
    return componentsContent;
};

const resolveComponentGroupNames = (
    resolver: any,
    componentsContent: any[],
) => {
    if (!resolver.componentGroupNames) return componentsContent;

    return componentsContent;
};
