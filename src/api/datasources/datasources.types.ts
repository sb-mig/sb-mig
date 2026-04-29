import type { OneFileElement } from "../../utils/path-utils.js";
import type { RequestBaseConfig } from "../utils/request.js";

export type GetAllDatasources = (config: RequestBaseConfig) => Promise<any>;
export type GetDatasource = (
    args: { datasourceName: string | undefined },
    config: RequestBaseConfig,
) => Promise<any>;

export type CreateDatasource = (
    args: { datasource: any },
    config: RequestBaseConfig,
) => Promise<any>;
export type UpdateDatasource = (
    args: { datasource: any; datasourceToBeUpdated: any },
    config: RequestBaseConfig,
) => Promise<any>;

export type SyncDatasources = (
    args: { providedDatasources: OneFileElement[]; dryRun?: boolean },
    config: RequestBaseConfig,
) => Promise<any>;
export type SyncProvidedDatasources = (
    args: { datasources: string[]; dryRun?: boolean },
    config: RequestBaseConfig,
) => Promise<void>;
export type SyncAllDatasources = (
    config: RequestBaseConfig,
    args?: { dryRun?: boolean },
) => Promise<void>;

// Datasource Entries
export type GetDatasourceEntries = (
    args: { datasourceName: string },
    config: RequestBaseConfig,
) => Promise<any>;
export type CreateDatasourceEntries = (
    args: {
        data: any;
        datasource_entries: any;
        remoteDatasourceEntries: any;
        dryRun?: boolean;
    },
    config: RequestBaseConfig,
) => Promise<any> | void;
export type CreateDatasourceEntry = (
    args: {
        data: any;
        datasourceEntry: any;
    },
    config: RequestBaseConfig,
) => Promise<any>;
export type UpdateDatasourceEntry = (
    args: {
        data: any;
        datasourceEntry: any;
        datasourceToBeUpdated: any;
    },
    config: RequestBaseConfig,
) => Promise<any>;

export type _UpdateDatasourceEntry = (
    args: {
        currentDatasource: any;
        finalDatasource_entry: any;
    },
    config: RequestBaseConfig,
) => Promise<any>;

export type _CreateDatasourceEntry = _UpdateDatasourceEntry;

export type _DecorateWithDimensions = (
    args: {
        currentDatasource: any;
        dimensionsData: any;
        _callback: any;
    },
    config: RequestBaseConfig,
) => Promise<any>;
