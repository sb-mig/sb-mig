"use strict";
/**
 * Array utility functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._uniqueValuesFrom = exports.uniqueValuesFrom = void 0;
/**
 * Get unique values from an array
 * Uses Set for O(n) deduplication
 *
 * @param array - The array to deduplicate
 * @returns A new array with only unique values
 *
 * @example
 * uniqueValuesFrom([1, 2, 2, 3, 3, 3]) // => [1, 2, 3]
 * uniqueValuesFrom(['a', 'b', 'a']) // => ['a', 'b']
 */
const uniqueValuesFrom = (array) => [...new Set(array)];
exports.uniqueValuesFrom = uniqueValuesFrom;
/**
 * @deprecated Use uniqueValuesFrom instead
 * Alias for backwards compatibility
 */
exports._uniqueValuesFrom = exports.uniqueValuesFrom;
