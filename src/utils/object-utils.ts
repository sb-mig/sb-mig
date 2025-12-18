/**
 * General object utility functions
 */

/**
 * Filter out null and undefined values from an object
 * Keeps all properties that have defined values (including falsy values like 0, '', false)
 *
 * @param params - The object to filter
 * @returns A new object with only non-nullish values
 *
 * @example
 * notNullish({ a: 1, b: null, c: undefined, d: 0 }) // => { a: 1, d: 0 }
 */
export const notNullish = <T extends Record<string, any>>(params: T): T => {
    return Object.keys(params).reduce((acc, key) => {
        if (params[key] !== null && params[key] !== undefined) {
            acc[key] = params[key];
        }
        return acc;
    }, {} as any);
};

/**
 * Check if an object is empty (has no own properties)
 * Returns true for null, undefined, and empty objects {}
 * Returns false for arrays (even empty ones) and objects with properties
 *
 * @param obj - The object to check
 * @returns true if the object is empty, null, or undefined
 *
 * @example
 * isObjectEmpty({}) // => true
 * isObjectEmpty(null) // => true
 * isObjectEmpty({ name: 'test' }) // => false
 * isObjectEmpty([]) // => false (arrays are not plain objects)
 */
export const isObjectEmpty = (obj: any) => {
    if (obj) {
        return Object.keys(obj).length === 0 && obj.constructor === Object;
    } else {
        return true;
    }
};

/**
 * Extract specific fields from an object based on a filter object
 * Supports nested object extraction
 *
 * @param data - The source object to extract fields from
 * @param filter - An object where true means include the field, nested objects for nested extraction
 * @returns A new object containing only the specified fields
 *
 * @example
 * const data = { name: 'hero', id: 123, schema: { title: 'text' } };
 * extractFields(data, { name: true, id: true }) // => { name: 'hero', id: 123 }
 *
 * @example
 * // Nested extraction
 * extractFields(data, { schema: { title: true } }) // => { schema: { title: 'text' } }
 */
export const extractFields = (data: any, filter: any) => {
    const result: any = {};

    for (const key in filter) {
        if (filter[key] === true) {
            result[key] = data[key];
        } else if (typeof filter[key] === "object") {
            result[key] = extractFields(data[key], filter[key]);
        }
    }

    return result;
};
