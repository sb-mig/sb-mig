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
