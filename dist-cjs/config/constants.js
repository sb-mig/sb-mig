"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storyblokApiMapping = exports.SCHEMA = void 0;
exports.SCHEMA = {
    TS: "ts",
    JS: "js",
};
exports.storyblokApiMapping = {
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
    ap: {
        managementApi: "https://api-ap.storyblok.com/v1",
        deliveryApi: "https://api-ap.storyblok.com/v2",
        graphql: "https://gapi-ap.storyblok.com/v1/api",
    },
};
