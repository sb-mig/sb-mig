export const generateDatestamp = (datestamp: Date) =>
    `${datestamp.getFullYear()}-${datestamp.getMonth()}-${datestamp.getDay()}_${datestamp.getHours()}-${datestamp.getMinutes()}-${datestamp.getSeconds()}`;
