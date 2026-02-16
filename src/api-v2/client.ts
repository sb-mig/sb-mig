import StoryblokClient from "storyblok-js-client";

export interface ClientConfig {
    oauthToken: string;
    spaceId: string;
    accessToken?: string;
    rateLimit?: number;
}

export interface ApiClient {
    config: ClientConfig;
    sbApi: StoryblokClient;
    spaceId: string;
}

export function createClient(options: ClientConfig): ApiClient {
    const sbApi = new StoryblokClient(
        {
            oauthToken: options.oauthToken,
            accessToken: options.accessToken,
            rateLimit: options.rateLimit ?? 3,
            cache: {
                clear: "auto",
                type: "none",
            },
        },
        "https://mapi.storyblok.com/v1",
    );

    return {
        config: options,
        sbApi,
        spaceId: options.spaceId,
    };
}
