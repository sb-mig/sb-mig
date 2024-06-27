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

// function deepTransform(obj: any, transformers: any): any {
//     if (typeof obj !== "object") return obj;
//
//     for (const key in obj) {
//         if (typeof transformers[key] === "function") {
//             obj[key] = transformers[key](obj[key]);
//         } else if (typeof obj[key] === "object") {
//             obj[key] = deepTransform(obj[key], transformers[key] || {});
//         }
//     }
//
//     return obj;
// }

// function deepTransform(obj: any, transformers: any): any {
//     if (typeof obj !== "object" || obj === null) {
//         return obj;
//     }
//
//     const result = Array.isArray(obj) ? [...obj] : { ...obj };
//
//     for (const key in transformers) {
//         if (typeof transformers[key] === "function") {
//             result[key] = transformers[key](obj[key]);
//         } else if (
//             typeof transformers[key] === "object" &&
//             transformers[key] !== null
//         ) {
//             result[key] = deepTransform(obj[key], transformers[key]);
//         } else {
//             result[key] = transformers[key];
//         }
//     }
//
//     return result;
// }

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
    specifiedComponentsContent: any,
    resolverFilesContent: any,
) => {
    let resolvedComponents = [];
    console.log("#### Specified Components Content to Resolve ####");
    console.log(specifiedComponentsContent);

    console.log("#### Resolver Files Content ####");
    console.log(resolverFilesContent);

    const resolver = resolverFilesContent[0];

    console.log("kjashdkjhaskjdh");
    console.log(resolver);

    resolvedComponents = resolveComponentNames(
        resolver,
        specifiedComponentsContent,
    );
    resolvedComponents = resolveComponentGroupNames(
        resolver,
        resolvedComponents,
    );
    resolvedComponents = resolvePluginNames(resolver, resolvedComponents);

    console.log("@@@@@@@@");
    console.log(resolvedComponents[0].schema);
    console.log("@@@@@@@@");

    return resolvedComponents;
};

const resolveComponentNames = (
    resolver: SchemaGlobalResolvers,
    componentsContent: any[],
) => {
    if (!resolver.byComponentNames) return componentsContent;

    let workingContent = componentsContent;

    resolver.byComponentNames.map((componentNameResolver) => {
        workingContent = workingContent.map((component: any) => {
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

            console.log("******************************s*********************");
            console.log("********************************s*******************");
            console.log(
                "This is finally changed component after all transformations by componentNames: ",
            );
            console.log(component.schema);
            console.log("***************************************************");
            console.log("***************************************************");

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
