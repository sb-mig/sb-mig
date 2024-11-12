import type { RequestBaseConfig } from "../api/utils/request.js";

export const generateDatestamp = (datestamp: Date) => {
    const year = datestamp.getFullYear();
    const month = datestamp.getMonth() + 1;
    const day = datestamp.getDate();
    const hours = datestamp.getHours();
    const minutes = datestamp.getMinutes();

    return `${year}-${month}-${day}_${hours}-${minutes}`;
};

export const getFrom = (flags: any, config: RequestBaseConfig): string =>
    (flags["from"] ? flags["from"] : config.spaceId).toString();
export const getTo = (flags: any, config: RequestBaseConfig): string =>
    (flags["to"] ? flags["to"] : config.spaceId).toString();

export const getSourceSpace = (flags: any, config: RequestBaseConfig): string =>
    (flags["sourceSpace"] ? flags["sourceSpace"] : config.spaceId).toString();
export const getTargetSpace = (flags: any, config: RequestBaseConfig): string =>
    (flags["targetSpace"] ? flags["targetSpace"] : config.spaceId).toString();

export const getWhat = (flags: any): string =>
    (flags["what"] ? flags["what"] : "all").toString();
export const getWhere = (flags: any): string =>
    (flags["where"] ? flags["where"] : "all").toString();

export const getRecursive = (flags: any): boolean =>
    flags["recursive"] ? flags["recursive"] : false;
