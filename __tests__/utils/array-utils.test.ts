import { describe, it, expect } from "vitest";

import {
    uniqueValuesFrom,
    _uniqueValuesFrom,
} from "../../src/utils/array-utils.js";

describe("uniqueValuesFrom - array deduplication", () => {
    it("should remove duplicate values from array", () => {
        const input = [1, 2, 2, 3, 3, 3, 4];

        expect(uniqueValuesFrom(input)).toEqual([1, 2, 3, 4]);
    });

    it("should preserve order (first occurrence)", () => {
        const input = [3, 1, 2, 1, 3, 2];

        expect(uniqueValuesFrom(input)).toEqual([3, 1, 2]);
    });

    it("should work with strings", () => {
        const input = ["hero", "card", "hero", "footer", "card"];

        expect(uniqueValuesFrom(input)).toEqual(["hero", "card", "footer"]);
    });

    it("should handle empty array", () => {
        expect(uniqueValuesFrom([])).toEqual([]);
    });

    it("should handle array with single element", () => {
        expect(uniqueValuesFrom([42])).toEqual([42]);
    });

    it("should handle array with all duplicates", () => {
        expect(uniqueValuesFrom(["a", "a", "a"])).toEqual(["a"]);
    });

    it("should handle array with no duplicates", () => {
        const input = [1, 2, 3, 4, 5];

        expect(uniqueValuesFrom(input)).toEqual([1, 2, 3, 4, 5]);
    });

    it("should distinguish between different types", () => {
        const input = [1, "1", 1, "1"];

        expect(uniqueValuesFrom(input)).toEqual([1, "1"]);
    });

    it("should handle null and undefined", () => {
        const input = [null, undefined, null, undefined, 1];

        expect(uniqueValuesFrom(input)).toEqual([null, undefined, 1]);
    });

    it("should handle boolean values", () => {
        const input = [true, false, true, false, true];

        expect(uniqueValuesFrom(input)).toEqual([true, false]);
    });
});

describe("_uniqueValuesFrom - backwards compatibility alias", () => {
    it("should be the same function as uniqueValuesFrom", () => {
        const input = [1, 2, 2, 3];

        expect(_uniqueValuesFrom(input)).toEqual(uniqueValuesFrom(input));
    });
});

