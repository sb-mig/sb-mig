import type { ApiClient, ClientConfig } from "./client.js";
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

/**
 * Inverse of `toRequestConfig`: adapt a legacy `RequestBaseConfig` into an
 * `ApiClient`.
 *
 * This is the primitive used by the Strategy-B shims (see SDK-REFACTOR.md §3): a
 * legacy `api/<x>` function receives a `RequestBaseConfig` and delegates to the
 * moved `api-v2/<x>` function, which takes an `ApiClient`. The live `sbApi`
 * instance is reused (not recreated) so rate-limit and cache state are preserved.
 *
 * Note: `ApiClient` intentionally carries only the data-API essentials (`sbApi`,
 * `spaceId`, tokens). The remaining `IStoryblokConfig` fields on
 * `RequestBaseConfig` (directories, extensions, resolvers, …) are node-tier /
 * file-discovery concerns handled separately — they are not represented on
 * `ApiClient`. See SDK-REFACTOR.md §4 and ticket F5.
 */
export function configToClient(
    config: RequestBaseConfig,
    overrides?: Partial<ClientConfig>,
): ApiClient {
    const clientConfig: ClientConfig = {
        oauthToken: overrides?.oauthToken ?? config.oauthToken ?? "",
        spaceId: overrides?.spaceId ?? config.spaceId,
        accessToken: overrides?.accessToken ?? config.accessToken,
        rateLimit: overrides?.rateLimit ?? config.rateLimit,
    };

    return {
        config: clientConfig,
        sbApi: config.sbApi,
        spaceId: clientConfig.spaceId,
    };
}
