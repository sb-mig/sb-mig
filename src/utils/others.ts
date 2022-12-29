export const generateDatestamp = (datestamp: Date) =>
    `${datestamp.getUTCFullYear()}-${datestamp.getUTCMonth()}-${datestamp.getUTCDay()}_${datestamp.getUTCHours()}-${datestamp.getUTCMinutes()}-${datestamp.getUTCSeconds()}`;
