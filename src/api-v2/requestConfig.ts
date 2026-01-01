import type { ApiClient } from "./client.js";
import type { RequestBaseConfig } from "../api/utils/request.js";

export function toRequestConfig(
    client: ApiClient,
    overrides?: Partial<Omit<RequestBaseConfig, "sbApi">> & {
        spaceId?: string;
    },
): RequestBaseConfig {
    return {
        spaceId: overrides?.spaceId ?? client.spaceId,
        sbApi: client.sbApi,
        oauthToken: overrides?.oauthToken ?? client.config.oauthToken,
        accessToken: overrides?.accessToken ?? client.config.accessToken,
        storyblokApiUrl: overrides?.storyblokApiUrl,
        storyblokDeliveryApiUrl: overrides?.storyblokDeliveryApiUrl,
        storyblokGraphqlApiUrl: overrides?.storyblokGraphqlApiUrl,
        schemaFileExt: overrides?.schemaFileExt,
        datasourceExt: overrides?.datasourceExt,
        rolesExt: overrides?.rolesExt,
        storiesExt: overrides?.storiesExt,
        migrationConfigExt: overrides?.migrationConfigExt,
        sbmigWorkingDirectory: overrides?.sbmigWorkingDirectory,
        presetsBackupDirectory: overrides?.presetsBackupDirectory,
        storiesBackupDirectory: overrides?.storiesBackupDirectory,
        componentsDirectories: overrides?.componentsDirectories,
        flushCache: overrides?.flushCache,
        cacheDir: overrides?.cacheDir,
        debug: overrides?.debug,
        rateLimit: overrides?.rateLimit,
        openaiToken: overrides?.openaiToken,
        boilerplateSpaceId: overrides?.boilerplateSpaceId,
        schemaType: overrides?.schemaType,
        awsBucketData: overrides?.awsBucketData,
        metadataSelection: overrides?.metadataSelection,
        contentHubOriginUrl: overrides?.contentHubOriginUrl,
        contentHubAuthorizationToken: overrides?.contentHubAuthorizationToken,
        resolvers: overrides?.resolvers,
        advancedResolvers: overrides?.advancedResolvers,
        storyblokComponentsLocalDirectory:
            overrides?.storyblokComponentsLocalDirectory,
    };
}
