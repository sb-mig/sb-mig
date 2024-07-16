import type { StoryblokComponentSchemaBase } from "storyblok-schema-types";
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

export type ComponentWhitelistSimpleResolver = (
    prevComponentWhitelist: string[],
) => string[];
export type TranslatableSimpleResolver = (prevTranslatable: boolean) => boolean;

export interface SimpleResolver {
    match: string[];
    fields: {
        component_whitelist?: ComponentWhitelistSimpleResolver;
        translatable?: TranslatableSimpleResolver;
        // [key: string]: <T>(fieldData: T) => T;
    };
}
