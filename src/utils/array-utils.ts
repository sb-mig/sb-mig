/**
 * Array utility functions
 */

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
export const uniqueValuesFrom = <T>(array: T[]): T[] => [...new Set(array)];

/**
 * @deprecated Use uniqueValuesFrom instead
 * Alias for backwards compatibility
 */
export const _uniqueValuesFrom = uniqueValuesFrom;
