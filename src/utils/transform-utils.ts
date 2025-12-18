/**
 * Object transformation utilities
 * Pure functions for deep object manipulation
 */

/**
 * Recursively extend a field in a nested object
 * If the field is an array, appends unique values
 * If the field is an object, merges properties
 *
 * @param obj - The object to search and extend
 * @param targetField - The field name to find and extend
 * @param newValue - The value(s) to add
 * @returns true if field was found and extended, false otherwise
 *
 * @example
 * const obj = { schema: { items: ['a', 'b'] } };
 * extendField(obj, 'items', ['c', 'd']);
 * // obj.schema.items is now ['a', 'b', 'c', 'd']
 */
export const extendField = (
    obj: any,
    targetField: string,
    newValue: any,
): boolean => {
    if (typeof obj !== "object" || obj === null) {
        return false;
    }

    if (obj.hasOwnProperty(targetField)) {
        if (Array.isArray(obj[targetField])) {
            for (const element of newValue) {
                if (!obj[targetField].includes(element)) {
                    obj[targetField] = [...obj[targetField], element];
                }
            }
        } else if (typeof obj[targetField] === "object") {
            obj[targetField] = { ...obj[targetField], ...newValue };
        }

        return true;
    }

    for (const key in obj) {
        if (extendField(obj[key], targetField, newValue)) {
            return true;
        }
    }

    return false;
};

/**
 * Deep transform an object using a transformer specification
 * Supports function transformers, nested object transformers, and literal values
 *
 * @param obj - The source object to transform
 * @param transformers - Specification object where:
 *   - function values: called with current value, result used as new value
 *   - object values: recursively applied to nested objects
 *   - other values: used directly as the new value
 * @returns New transformed object (original is not mutated)
 *
 * @example
 * const obj = { name: 'hero', count: 5 };
 * const result = deepTransform(obj, {
 *   name: (v) => v.toUpperCase(),
 *   count: (v) => v * 2,
 * });
 * // result: { name: 'HERO', count: 10 }
 *
 * @example
 * // Nested transformation
 * const obj = { schema: { title: 'old' } };
 * const result = deepTransform(obj, {
 *   schema: { title: 'new' }
 * });
 * // result: { schema: { title: 'new' } }
 */
export function deepTransform(obj: any, transformers: any): any {
    if (typeof obj !== "object" || obj === null) {
        return obj;
    }

    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in transformers) {
        if (typeof transformers[key] === "function") {
            result[key] = transformers[key](obj[key]);
        } else if (
            typeof transformers[key] === "object" &&
            transformers[key] !== null
        ) {
            result[key] = deepTransform(obj[key] || {}, transformers[key]);
        } else {
            result[key] = transformers[key];
        }
    }

    // Preserve untransformed properties
    for (const key in obj) {
        if (!(key in transformers)) {
            result[key] = obj[key];
        }
    }

    return result;
}

/**
 * Check if a component has content available as bloks
 *
 * @param component - Storyblok component schema
 * @returns true if component.schema.content is a bloks field with whitelist
 */
export const isContentAvailableAsBloks = (component: any): boolean =>
    "content" in component.schema &&
    component.schema.content.component_whitelist &&
    component.schema.content.type === "bloks";

/**
 * Check if a component has items available as bloks
 *
 * @param component - Storyblok component schema
 * @returns true if component.schema.items is a bloks field with whitelist
 */
export const isItemsAvailableAsBloks = (component: any): boolean =>
    "items" in component.schema &&
    component.schema.items.component_whitelist &&
    component.schema.items.type === "bloks";
