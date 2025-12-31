"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
const storyblok_js_client_1 = __importDefault(require("storyblok-js-client"));
function createClient(options) {
    const sbApi = new storyblok_js_client_1.default({
        oauthToken: options.oauthToken,
        accessToken: options.accessToken,
        rateLimit: options.rateLimit ?? 3,
        cache: {
            clear: "auto",
            type: "none",
        },
    }, "https://mapi.storyblok.com/v1");
    return {
        config: options,
        sbApi,
        spaceId: options.spaceId,
    };
}
