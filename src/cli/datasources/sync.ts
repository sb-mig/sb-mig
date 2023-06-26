import type {
    SyncAllDatasources,
    SyncProvidedDatasources,
} from "../../api/datasources/datasources.types.js";

import { managementApi } from "../../api/managementApi.js";
import {
    discoverDatasources,
    discoverManyDatasources,
    LOOKUP_TYPE,
    SCOPE,
} from "../utils/discover.js";

export const syncProvidedDatasources: SyncProvidedDatasources = async (
    args,
    config
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

    managementApi.datasources.syncDatasources(
        {
            providedDatasources: [
                ...allLocalDatasources,
                ...allExternalDatasources,
            ],
        },
        config
    );
};

export const syncAllDatasources: SyncAllDatasources = (config) => {
    const allLocalDatasources = discoverDatasources({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });

    const allExternalDatasources = discoverDatasources({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });

    managementApi.datasources.syncDatasources(
        {
            providedDatasources: [
                ...allLocalDatasources,
                ...allExternalDatasources,
            ],
        },
        config
    );
};
