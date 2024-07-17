export const SCHEMA = {
    TS: "ts",
    JS: "js",
} as const;

export interface StoryblokApiMapping {
    eu: {
        managementApi: "https://mapi.storyblok.com/v1";
        deliveryApi: "https://api.storyblok.com/v2";
        graphql: "https://gapi.storyblok.com/v1/api";
    };
    us: {
        managementApi: "https://api-us.storyblok.com/v1";
        deliveryApi: "https://api-us.storyblok.com/v2";
        graphql: "https://gapi-us.storyblok.com/v1/api";
    };
    cn: {
        managementApi: "https://app.storyblokchina.cn";
        deliveryApi: "https://app.storyblokchina.cn";
        graphql: "";
    };
}

export const storyblokApiMapping: StoryblokApiMapping = {
    eu: {
        managementApi: "https://mapi.storyblok.com/v1",
        deliveryApi: "https://api.storyblok.com/v2",
        graphql: "https://gapi.storyblok.com/v1/api",
    },
    us: {
        managementApi: "https://api-us.storyblok.com/v1",
        deliveryApi: "https://api-us.storyblok.com/v2",
        graphql: "https://gapi-us.storyblok.com/v1/api",
    },
    cn: {
        managementApi: "https://app.storyblokchina.cn",
        deliveryApi: "https://app.storyblokchina.cn",
        graphql: "",
    },
};
