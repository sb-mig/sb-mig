import { describe, it, expect } from "vitest";

import {
    notNullish,
    isObjectEmpty,
    extractFields,
} from "../../src/utils/object-utils.js";

describe("notNullish - filter null/undefined values", () => {
    it("should remove null values from object", () => {
        const input = { a: 1, b: null, c: 3 };

        expect(notNullish(input)).toEqual({ a: 1, c: 3 });
    });

    it("should remove undefined values from object", () => {
        const input = { a: 1, b: undefined, c: 3 };

        expect(notNullish(input)).toEqual({ a: 1, c: 3 });
    });

    it("should remove both null and undefined values", () => {
        const input = { a: 1, b: null, c: undefined, d: 4 };

        expect(notNullish(input)).toEqual({ a: 1, d: 4 });
    });

    it("should keep falsy values like 0, empty string, false", () => {
        const input = { a: 0, b: "", c: false, d: null };

        expect(notNullish(input)).toEqual({ a: 0, b: "", c: false });
    });

    it("should return empty object when all values are nullish", () => {
        const input = { a: null, b: undefined };

        expect(notNullish(input)).toEqual({});
    });

    it("should return same object when no nullish values", () => {
        const input = { a: 1, b: "test", c: true };

        expect(notNullish(input)).toEqual({ a: 1, b: "test", c: true });
    });

    it("should handle empty object", () => {
        expect(notNullish({})).toEqual({});
    });

    it("should preserve nested objects even if they contain nullish", () => {
        const input = { a: { nested: null }, b: null };

        // notNullish only filters top-level nullish values
        expect(notNullish(input)).toEqual({ a: { nested: null } });
    });

    it("should preserve arrays", () => {
        const input = { arr: [1, 2, 3], b: null };

        expect(notNullish(input)).toEqual({ arr: [1, 2, 3] });
    });
});

describe("isObjectEmpty - empty object detection", () => {
    it("should return true for empty object", () => {
        expect(isObjectEmpty({})).toBe(true);
    });

    it("should return false for object with properties", () => {
        expect(isObjectEmpty({ name: "hero" })).toBe(false);
        expect(isObjectEmpty({ a: 1, b: 2 })).toBe(false);
    });

    it("should return true for null", () => {
        expect(isObjectEmpty(null)).toBe(true);
    });

    it("should return true for undefined", () => {
        expect(isObjectEmpty(undefined)).toBe(true);
    });

    it("should return false for arrays (not plain objects)", () => {
        // Arrays have constructor Array, not Object
        expect(isObjectEmpty([])).toBe(false);
    });

    it("should return false for objects with only falsy values", () => {
        expect(isObjectEmpty({ value: 0 })).toBe(false);
        expect(isObjectEmpty({ value: "" })).toBe(false);
        expect(isObjectEmpty({ value: false })).toBe(false);
    });

    it("should return false for objects with nested empty objects", () => {
        expect(isObjectEmpty({ nested: {} })).toBe(false);
    });

    it("should return false for objects with null values", () => {
        expect(isObjectEmpty({ value: null })).toBe(false);
    });
});

describe("extractFields - selective field extraction", () => {
    it("should extract specified fields from object", () => {
        const data = {
            name: "hero",
            id: 123,
            schema: { title: "text" },
            createdAt: "2024-01-01",
        };

        const filter = {
            name: true,
            id: true,
        };

        expect(extractFields(data, filter)).toEqual({
            name: "hero",
            id: 123,
        });
    });

    it("should handle nested objects", () => {
        const data = {
            component: {
                name: "hero",
                schema: {
                    title: { type: "text" },
                    content: { type: "richtext" },
                },
            },
        };

        const filter = {
            component: {
                name: true,
                schema: {
                    title: true,
                },
            },
        };

        expect(extractFields(data, filter)).toEqual({
            component: {
                name: "hero",
                schema: {
                    title: { type: "text" },
                },
            },
        });
    });

    it("should return empty object when no fields match", () => {
        const data = { name: "hero", id: 123 };
        const filter = {};

        expect(extractFields(data, filter)).toEqual({});
    });

    it("should handle deeply nested structures", () => {
        const data = {
            a: {
                b: {
                    c: {
                        value: 42,
                    },
                },
            },
        };

        const filter = {
            a: {
                b: {
                    c: {
                        value: true,
                    },
                },
            },
        };

        expect(extractFields(data, filter)).toEqual({
            a: { b: { c: { value: 42 } } },
        });
    });

    it("should skip undefined properties gracefully", () => {
        const data = { name: "hero" };
        const filter = {
            name: true,
            nonexistent: true,
        };

        const result = extractFields(data, filter);

        expect(result.name).toBe("hero");
        expect(result.nonexistent).toBeUndefined();
    });

    it("should extract array values", () => {
        const data = {
            items: [1, 2, 3],
            name: "list",
        };

        const filter = {
            items: true,
        };

        expect(extractFields(data, filter)).toEqual({
            items: [1, 2, 3],
        });
    });

    it("should extract boolean values correctly", () => {
        const data = {
            enabled: true,
            disabled: false,
        };

        const filter = {
            enabled: true,
            disabled: true,
        };

        expect(extractFields(data, filter)).toEqual({
            enabled: true,
            disabled: false,
        });
    });
});
