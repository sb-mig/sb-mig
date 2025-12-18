/**
 * Date utility functions
 */

/**
 * Generate a datestamp string from a Date object
 * Format: YYYY-M-D_H-M (no zero-padding)
 *
 * @param datestamp - The Date object to format
 * @returns Formatted date string
 *
 * @example
 * generateDatestamp(new Date('2024-03-15T10:30:00')) // => '2024-3-15_10-30'
 */
export const generateDatestamp = (datestamp: Date) => {
    const year = datestamp.getFullYear();
    const month = datestamp.getMonth() + 1;
    const day = datestamp.getDate();
    const hours = datestamp.getHours();
    const minutes = datestamp.getMinutes();

    return `${year}-${month}-${day}_${hours}-${minutes}`;
};
