import type {
    SyncAllDatasources,
    SyncProvidedDatasources,
} from "../../api/datasources/datasources.types.js";

import { managementApi } from "../../api/managementApi.js";
import {
    compare,
    discoverDatasources,
    discoverManyDatasources,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";

export const syncProvidedDatasources: SyncProvidedDatasources = async (
    args,
    config,
) => {
    const { datasources } = args;

    const allLocalDatasources = await discoverManyDatasources({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: datasources,
    });

    const allExternalDatasources = await discoverManyDatasources({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
        fileNames: datasources,
    });

    // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalDatasources,
        external: allExternalDatasources,
    });

    managementApi.datasources.syncDatasources(
        {
            providedDatasources: [...local, ...external],
        },
        config,
    );
};

export const syncAllDatasources: SyncAllDatasources = async (config) => {
    const allLocalDatasources = await discoverDatasources({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    const allExternalDatasources = await discoverDatasources({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });

    const { local, external } = compare({
        local: allLocalDatasources,
        external: allExternalDatasources,
    });

    console.log("############");
    console.log({ local, external });
    console.log("############");

    managementApi.datasources.syncDatasources(
        {
            providedDatasources: [...local, ...external],
        },
        config,
    );
};
