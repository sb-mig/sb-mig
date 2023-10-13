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

const resolveComponentGroupNames = (
    resolver: any,
    componentsContent: any[],
) => {
    if (!resolver.componentGroupNames) return componentsContent;

    return componentsContent;
};

const resolveComponentNames = (resolver: any, componentsContent: any[]) => {
    if (!resolver.componentNames) return componentsContent;

    const componentNamesResolver = resolver.componentNames;

    componentsContent.map((component: any) => {
        if (componentNamesResolver.names.includes(component.name)) {
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
        }

        return component;
    });

    return componentsContent;
};

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

    // resolvedComponents = resolveAll(resolver, specifiedComponentsContent)
    // resolvedComponents = resolveComponentGroupNames(resolver, resolvedComponents)
    resolvedComponents = resolveComponentNames(
        resolver,
        specifiedComponentsContent,
    );

    console.log("@@@@@@@@");
    console.log(resolvedComponents[0].schema);
    console.log("@@@@@@@@");

    return resolvedComponents;
};
