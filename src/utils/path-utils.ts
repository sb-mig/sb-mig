/**
 * Path and glob pattern utilities for file discovery
 */

import path from "path";

/**
 * Represents a file element with its name and path
 */
export interface OneFileElement {
    name: string;
    p: string;
}

/**
 * Result of comparing local and external file arrays
 */
export interface CompareResult {
    local: OneFileElement[];
    external: OneFileElement[];
}

/**
 * Request for comparing local and external file paths
 */
interface CompareRequest {
    local: string[];
    external: string[];
}

/**
 * Normalizes an array of directory segments for glob pattern usage.
 * Handles the glob.sync quirk where single segments don't need braces,
 * but multiple segments need {segment1,segment2} format.
 *
 * @param segments - Array of directory path segments
 * @returns Normalized string for glob pattern
 *
 * @example
 * normalizeDiscover({ segments: [] }) // => ""
 * normalizeDiscover({ segments: ["src"] }) // => "src"
 * normalizeDiscover({ segments: ["src", "lib"] }) // => "{src,lib}"
 */
export const normalizeDiscover = ({
    segments,
}: {
    segments: string[];
}): string => {
    if (segments.length === 0) {
        return "";
    }
    if (segments.length === 1) {
        return segments[0] as string;
    }
    return `{${segments.join(",")}}`;
};

/**
 * Builds a glob file pattern for discovering files with a specific extension.
 * Automatically handles single vs multiple directory paths.
 *
 * @param mainDirectory - The root directory to search from
 * @param componentDirectories - Array of subdirectories to search in
 * @param ext - File extension to match (without leading dot)
 * @returns A glob pattern string
 *
 * @example
 * filesPattern({
 *   mainDirectory: "/project",
 *   componentDirectories: ["src"],
 *   ext: "sb.js"
 * })
 * // => "/project/src/**\/[^_]*.sb.js"
 *
 * filesPattern({
 *   mainDirectory: "/project",
 *   componentDirectories: ["src", "lib"],
 *   ext: "sb.js"
 * })
 * // => "/project/{src,lib}/**\/[^_]*.sb.js"
 */
export const filesPattern = ({
    mainDirectory,
    componentDirectories,
    ext,
}: {
    mainDirectory: string;
    componentDirectories: string[];
    ext: string;
}): string => {
    return componentDirectories.length === 1
        ? path.join(
              `${mainDirectory}`,
              `${componentDirectories[0]}`,
              "**",
              `[^_]*.${ext}`, // all files with 'ext' extension, without files beginning with _
          )
        : path.join(
              `${mainDirectory}`,
              `{${componentDirectories.join(",")}}`,
              "**",
              `[^_]*.${ext}`, // all files with 'ext' extension, without files beginning with _
          );
};

/**
 * Compares local and external file path arrays.
 * Splits paths to extract file names, filters out duplicates from external
 * (preferring local files), and filters out nested node_modules.
 *
 * @param request - Object containing local and external path arrays
 * @returns CompareResult with processed local and external file elements
 *
 * @example
 * compare({
 *   local: ["/project/src/hero.sb.js"],
 *   external: ["/project/node_modules/pkg/hero.sb.js", "/project/node_modules/pkg/card.sb.js"]
 * })
 * // => {
 * //   local: [{ name: "hero.sb.js", p: "/project/src/hero.sb.js" }],
 * //   external: [{ name: "card.sb.js", p: "/project/node_modules/pkg/card.sb.js" }]
 * // }
 */
export const compare = (request: CompareRequest): CompareResult => {
    const { local, external } = request;

    const splittedLocal = local.map((p) => {
        return {
            name: p.split(path.sep)[p.split(path.sep).length - 1], // last element of split array - file name
            p,
        };
    });

    const splittedExternal = external
        .map((p) => {
            return {
                name: p.split(path.sep)[p.split(path.sep).length - 1], // last element of split array - file name
                p,
            };
        })
        .filter((file) => {
            // Filter out files from nested node_modules (node_modules within node_modules)
            const nodeModulesCount = (file.p.match(/node_modules/g) || [])
                .length;
            return nodeModulesCount <= 1;
        });

    // Filter external array to remove items that exist locally (local takes priority)
    const result = {
        local: splittedLocal,
        external: splittedExternal.filter((externalComponent) => {
            if (
                splittedLocal.find(
                    (localComponent) =>
                        externalComponent.name === localComponent.name,
                )
            ) {
                return false;
            }
            return true;
        }),
    } as CompareResult;

    return result;
};
