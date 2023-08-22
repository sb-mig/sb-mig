import type {
    SyncAllRoles,
    SyncProvidedRoles,
} from "../../api/roles/roles.types.js";

import { managementApi } from "../../api/managementApi.js";
import {
    compare,
    discoverManyRoles,
    discoverRoles,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";

export const syncAllRoles: SyncAllRoles = async (config) => {
    // #1: discover all external .roles.sb.js files
    const allLocalSbComponentsSchemaFiles = await discoverRoles({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });
    // #2: discover all local .roles.sb.js files
    const allExternalSbComponentsSchemaFiles = await discoverRoles({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });
    // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    // #4: sync - do all stuff already done (groups resolving, and so on)
    await managementApi.roles.syncRoles(
        { specifiedRoles: [...local, ...external] },
        config,
    );
};

export const syncProvidedRoles: SyncProvidedRoles = async (
    { roles }: { roles: string[] },
    config,
) => {
    // #1: discover all external .sb.js files
    const allLocalSbComponentsSchemaFiles = await discoverManyRoles({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: roles,
    });
    // #2: discover all local .sb.js files
    const allExternalSbComponentsSchemaFiles = await discoverManyRoles({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
        fileNames: roles,
    });
    // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    console.log({ local, external });

    // #4: sync - do all stuff already done (groups resolving, and so on)
    await managementApi.roles.syncRoles(
        { specifiedRoles: [...local, ...external] },
        config,
    );
};
