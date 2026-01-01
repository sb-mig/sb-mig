/**
 * Package loading utilities
 * ESM-compatible require wrapper for loading JSON/JS files dynamically
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * Load a package/module from the given path using require
 * Works in ESM context by using createRequire
 *
 * @param path - Path to the package/module to load
 * @returns The loaded module content
 *
 * @example
 * const packageJson = pkg('./package.json');
 * const config = pkg('some-config-file');
 */
export const pkg = (path: string) => {
    return require(path);
};
