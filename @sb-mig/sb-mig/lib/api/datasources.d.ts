export declare const getAllDatasources: () => Promise<any>;
export declare const getDatasource: (datasourceName: string) => Promise<any>;
export declare const getDatasourceEntries: (datasourceName: string) => Promise<any>;
export declare const createDatasource: (datasource: any) => Promise<void | {
    data: any;
    datasource_entries: any;
}>;
export declare const createDatasourceEntry: (datasourceEntry: any, datasourceId: string) => Promise<any>;
export declare const updateDatasourceEntry: (datasourceEntry: any, datasourceId: string, datasourceToBeUpdated: any) => Promise<any>;
export declare const updateDatasource: (datasource: any, temp: any) => Promise<void | {
    data: any;
    datasource_entries: any;
}>;
export declare const createDatasourceEntries: (datasourceId: string, datasource_entries: any, remoteDatasourceEntries: any) => void;
export declare const syncDatasources: (specifiedDatasources: any) => Promise<void>;
