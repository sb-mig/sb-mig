export interface ResolverMethods {
    extend?: Record<string, any>;
    add?: Record<string, any>;
    overwrite?: Record<string, any>;
    custom?: (bag: any) => Record<string, any>;
}

export interface ResolversBy {
    names: string[];
    methods: ResolverMethods;
}

export interface SchemaGlobalResolvers {
    all?: {
        methods: ResolverMethods;
    };
    byPluginNames?: ResolversBy[];
    byComponentGroupNames?: ResolversBy[];
    byComponentNames?: ResolversBy[];
}

export interface SchemaGlobalResolversSecond {
    components: {
        all?: {
            methods: ResolverMethods;
        };
        byPluginNames?: ResolversBy[];
        byComponentGroupNames?: ResolversBy[];
        byComponentNames?: ResolversBy[];
    };
    datasources: {
        all?: {
            methods: ResolverMethods;
        };
    };
}
