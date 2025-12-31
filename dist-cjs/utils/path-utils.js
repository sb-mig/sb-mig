"use strict";
/**
 * Path and glob pattern utilities for file discovery
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compare = exports.filesPattern = exports.normalizeDiscover = void 0;
const path_1 = __importDefault(require("path"));
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
const normalizeDiscover = ({ segments, }) => {
    if (segments.length === 0) {
        return "";
    }
    if (segments.length === 1) {
        return segments[0];
    }
    return `{${segments.join(",")}}`;
};
exports.normalizeDiscover = normalizeDiscover;
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
const filesPattern = ({ mainDirectory, componentDirectories, ext, }) => {
    return componentDirectories.length === 1
        ? path_1.default.join(`${mainDirectory}`, `${componentDirectories[0]}`, "**", `[^_]*.${ext}`)
        : path_1.default.join(`${mainDirectory}`, `{${componentDirectories.join(",")}}`, "**", `[^_]*.${ext}`);
};
exports.filesPattern = filesPattern;
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
const compare = (request) => {
    const { local, external } = request;
    const splittedLocal = local.map((p) => {
        return {
            name: p.split(path_1.default.sep)[p.split(path_1.default.sep).length - 1], // last element of split array - file name
            p,
        };
    });
    const splittedExternal = external
        .map((p) => {
        return {
            name: p.split(path_1.default.sep)[p.split(path_1.default.sep).length - 1], // last element of split array - file name
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
            if (splittedLocal.find((localComponent) => externalComponent.name === localComponent.name)) {
                return false;
            }
            return true;
        }),
    };
    return result;
};
exports.compare = compare;
