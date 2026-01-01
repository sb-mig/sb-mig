import type { SyncDatasources } from "./datasources.types.js";

import { getFileContentWithRequire } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

import { syncDatasourcesData } from "./datasources.js";

export const syncDatasources: SyncDatasources = async (args, config) => {
    const { providedDatasources } = args;
    Logger.log(`Trying to sync provided datasources: `);

    const providedDatasourcesContent = await Promise.all(
        providedDatasources.map((datasource) => {
            return getFileContentWithRequire({ file: datasource.p });
        }),
    );

    await syncDatasourcesData(
        { datasources: providedDatasourcesContent },
        config,
    );
};
