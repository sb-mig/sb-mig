import type { SCHEMA } from "./constants.js";
import type {
    SchemaGlobalResolvers,
    SimpleResolver,
} from "../api/utils/resolvers.types.js";
import type StoryblokClient from "storyblok-js-client";

export type SchemaType = (typeof SCHEMA)[keyof typeof SCHEMA];

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    presetsBackupDirectory: string;
    storiesBackupDirectory: string;
    componentsDirectories: string[];
    awsBucketData: {
        bucketName: string;
        s3Url: `s3://${string}`;
        httpUrl: `https://${string}`;
    };
    metadataSelection: Record<string, any>;
    contentHubOriginUrl: string;
    contentHubAuthorizationToken: string;
    schemaFileExt: "sb.cjs" | "sb.js";
    datasourceExt: string;
    rolesExt: string;
    storiesExt: string;
    migrationConfigExt: string;
    storyblokApiUrl: string;
    storyblokDeliveryApiUrl: string;
    storyblokGraphqlApiUrl: string;
    oauthToken: string;
    openaiToken: string;
    spaceId: string;
    accessToken: string;
    boilerplateSpaceId: string;
    schemaType: SchemaType;
    flushCache: boolean;
    cacheDir: string;
    debug: boolean;
    /**
     * Requests per second for the Management API.
     */
    rateLimit: number;
    /**
     * Requests per second for the Delivery API.
     *
     * Leave unset to let `storyblok-js-client` pick the limit per request: it
     * tiers CDN requests by `per_page` (up to 50 req/s for single stories) and
     * follows the `X-RateLimit-Policy` response headers. Set a number only to
     * throttle below that.
     */
    deliveryRateLimit?: number;
    sbApi?: () => StoryblokClient;
    resolvers?: SimpleResolver[];
    advancedResolvers?: SchemaGlobalResolvers;
}
