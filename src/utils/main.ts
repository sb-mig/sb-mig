/**
 * Re-exports for backwards compatibility
 * Functions have been moved to their proper modules
 */

// CLI utils - now in src/cli/utils/cli-utils.ts
export {
    prop,
    pipe,
    unpackElements,
    unpackOne,
    isItFactory,
} from "../cli/utils/cli-utils.js";

// Object utils - now in src/utils/object-utils.ts
export { isObjectEmpty, extractFields } from "./object-utils.js";

// File loading utils - now in src/utils/files.ts
export {
    getFileContent,
    getFileContentWithRequire,
    getFilesContentWithRequire,
    getPackageJson,
} from "./files.js";

// Async utils - now in src/utils/async-utils.ts
export { delay } from "./async-utils.js";
