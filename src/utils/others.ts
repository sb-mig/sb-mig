/**
 * Re-exports for backwards compatibility
 * Functions have been moved to their proper modules
 */

// Date utilities - now in date-utils.ts
export { generateDatestamp } from "./date-utils.js";

// CLI flag extractors - now in cli/utils/cli-utils.ts
export {
    getFrom,
    getTo,
    getSourceSpace,
    getTargetSpace,
    getWhat,
    getWhere,
    getRecursive,
} from "../cli/utils/cli-utils.js";
