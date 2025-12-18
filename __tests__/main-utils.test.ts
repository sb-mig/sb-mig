/**
 * Legacy tests for backwards compatibility
 * Main tests are now in:
 * - __tests__/cli/cli-utils.test.ts
 * - __tests__/utils/date-utils.test.ts
 *
 * This file tests that re-exports from main.ts still work
 */
import { describe, it, expect } from "vitest";

// Test that re-exports from main.ts work correctly
import {
    unpackElements,
    unpackOne,
    isItFactory,
    isObjectEmpty,
    getPackageJson,
    delay,
} from "../src/utils/main.js";
import { generateDatestamp } from "../src/utils/others.js";

describe("main.ts re-exports - backwards compatibility", () => {
    it("unpackElements is accessible from main.ts", () => {
        expect(unpackElements(["a", "b", "c"])).toEqual(["c"]);
    });

    it("unpackOne is accessible from main.ts", () => {
        expect(unpackOne(["a", "b", "c"])).toBe("c");
    });

    it("isItFactory is accessible from main.ts", () => {
        const isIt = isItFactory({ all: true }, { all: ["all"] }, []);
        expect(isIt("all")).toBe(true);
    });

    it("isObjectEmpty is accessible from main.ts", () => {
        expect(isObjectEmpty({})).toBe(true);
    });

    it("delay is accessible from main.ts", () => {
        expect(typeof delay).toBe("function");
    });
});

describe("others.ts re-exports - backwards compatibility", () => {
    it("generateDatestamp is accessible from others.ts", () => {
        const stamp = generateDatestamp(new Date("2024-01-01T12:00:00Z"));
        expect(stamp).toMatch(/^\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}$/);
    });
});
