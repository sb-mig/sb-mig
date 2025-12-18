/**
 * CLI-specific utility functions for building and parsing CLI commands
 */

import type { RequestBaseConfig } from "../../api/utils/request.js";

/**
 * Property accessor - curried function to get a property from an object
 * @example prop('name')({ name: 'hero' }) // => 'hero'
 */
export const prop = (k: any) => (o: any) => o[k];

/**
 * Pipe functions left to right (function composition)
 * @example pipe(addOne, double)(5) // => 12
 */
export const pipe =
    (...fns: any[]) =>
    (x: any) =>
        [...fns].reduce((acc, f) => f(acc), x);

/**
 * Extract elements after the first two from CLI input array
 * Used for parsing component names from commands like: sync components hero card
 * @example unpackElements(['sync', 'components', 'hero', 'card']) // => ['hero', 'card']
 */
export const unpackElements = (input: string[]) => {
    const [_1, _2, ...elementsForUse] = input;
    return elementsForUse;
};

/**
 * Extract the third element from CLI input array
 * Used for parsing single component name from commands
 * @example unpackOne(['sync', 'components', 'hero']) // => 'hero'
 */
export const unpackOne = (input: string[]) => {
    const [_1, _2, elementForUse] = input;
    return elementForUse;
};

/**
 * Factory for creating flag matchers
 * Used to determine which CLI action to take based on provided flags
 *
 * @param flags - The flags object from CLI parser
 * @param rules - Object mapping action names to required flag combinations
 * @param whitelist - Flags to ignore when matching (e.g., 'from', 'to')
 * @returns A function that checks if a given action type matches the flags
 *
 * @example
 * const rules = { all: ['all'], allWithPresets: ['all', 'presets'] };
 * const isIt = isItFactory({ all: true, presets: true }, rules, []);
 * isIt('allWithPresets') // => true
 */
export const isItFactory = <T>(flags: any, rules: any, whitelist: string[]) => {
    return (type: T) => {
        const rulesCopy = [...rules[type]];
        const flagsKeys = Object.keys(flags);

        const temp = flagsKeys.map((flag: string) => {
            if (whitelist.includes(flag)) {
                return true;
            }
            if (rulesCopy.includes(flag)) {
                rulesCopy.splice(rulesCopy.indexOf(flag), 1);
                return true;
            } else {
                return false;
            }
        });

        if (rulesCopy.length > 0) {
            return false;
        } else {
            return temp.every((el: boolean) => el === true);
        }
    };
};

// ============================================================================
// CLI Flag Extractors
// ============================================================================

/**
 * Extract 'from' space ID from flags, falling back to config spaceId
 */
export const getFrom = (flags: any, config: RequestBaseConfig): string =>
    (flags["from"] ? flags["from"] : config.spaceId).toString();

/**
 * Extract 'to' space ID from flags, falling back to config spaceId
 */
export const getTo = (flags: any, config: RequestBaseConfig): string =>
    (flags["to"] ? flags["to"] : config.spaceId).toString();

/**
 * Extract 'sourceSpace' from flags, falling back to config spaceId
 */
export const getSourceSpace = (flags: any, config: RequestBaseConfig): string =>
    (flags["sourceSpace"] ? flags["sourceSpace"] : config.spaceId).toString();

/**
 * Extract 'targetSpace' from flags, falling back to config spaceId
 */
export const getTargetSpace = (flags: any, config: RequestBaseConfig): string =>
    (flags["targetSpace"] ? flags["targetSpace"] : config.spaceId).toString();

/**
 * Extract 'what' flag, defaulting to 'all'
 */
export const getWhat = (flags: any): string =>
    (flags["what"] ? flags["what"] : "all").toString();

/**
 * Extract 'where' flag, defaulting to 'all'
 */
export const getWhere = (flags: any): string =>
    (flags["where"] ? flags["where"] : "all").toString();

/**
 * Extract 'recursive' flag, defaulting to false
 */
export const getRecursive = (flags: any): boolean =>
    flags["recursive"] ? flags["recursive"] : false;
