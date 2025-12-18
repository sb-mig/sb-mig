import { describe, it, expect } from "vitest";

import {
    extendField,
    deepTransform,
    isContentAvailableAsBloks,
    isItemsAvailableAsBloks,
} from "../../src/utils/transform-utils.js";

describe("extendField - recursive field extension", () => {
    describe("array extension", () => {
        it("should extend array field with new unique values", () => {
            const obj = { items: ["a", "b"] };

            const result = extendField(obj, "items", ["c", "d"]);

            expect(result).toBe(true);
            expect(obj.items).toEqual(["a", "b", "c", "d"]);
        });

        it("should not add duplicate values to array", () => {
            const obj = { items: ["a", "b"] };

            extendField(obj, "items", ["b", "c"]);

            expect(obj.items).toEqual(["a", "b", "c"]);
        });

        it("should find nested array fields", () => {
            const obj = { schema: { content: { whitelist: ["hero"] } } };

            const result = extendField(obj, "whitelist", ["card"]);

            expect(result).toBe(true);
            expect(obj.schema.content.whitelist).toEqual(["hero", "card"]);
        });
    });

    describe("object extension", () => {
        it("should merge object fields", () => {
            const obj = { config: { a: 1, b: 2 } };

            const result = extendField(obj, "config", { c: 3 });

            expect(result).toBe(true);
            expect(obj.config).toEqual({ a: 1, b: 2, c: 3 });
        });

        it("should overwrite existing properties when merging", () => {
            const obj = { config: { a: 1 } };

            extendField(obj, "config", { a: 99, b: 2 });

            expect(obj.config).toEqual({ a: 99, b: 2 });
        });
    });

    describe("edge cases", () => {
        it("should return false for null input", () => {
            expect(extendField(null, "field", ["value"])).toBe(false);
        });

        it("should return false for non-object input", () => {
            expect(extendField("string", "field", ["value"])).toBe(false);
            expect(extendField(123, "field", ["value"])).toBe(false);
        });

        it("should return false when field not found", () => {
            const obj = { other: ["a"] };

            expect(extendField(obj, "missing", ["b"])).toBe(false);
        });

        it("should handle deeply nested structures", () => {
            const obj = {
                level1: {
                    level2: {
                        level3: {
                            items: ["x"],
                        },
                    },
                },
            };

            const result = extendField(obj, "items", ["y", "z"]);

            expect(result).toBe(true);
            expect(obj.level1.level2.level3.items).toEqual(["x", "y", "z"]);
        });
    });
});

describe("deepTransform - object transformation", () => {
    describe("function transformers", () => {
        it("should apply function transformers to values", () => {
            const obj = { name: "hero", count: 5 };

            const result = deepTransform(obj, {
                name: (v: string) => v.toUpperCase(),
                count: (v: number) => v * 2,
            });

            expect(result).toEqual({ name: "HERO", count: 10 });
        });

        it("should not mutate original object", () => {
            const obj = { name: "hero" };

            deepTransform(obj, { name: (v: string) => v.toUpperCase() });

            expect(obj.name).toBe("hero");
        });
    });

    describe("nested transformations", () => {
        it("should apply nested object transformers", () => {
            const obj = { schema: { title: "old", type: "text" } };

            const result = deepTransform(obj, {
                schema: { title: "new" },
            });

            expect(result.schema.title).toBe("new");
            expect(result.schema.type).toBe("text");
        });

        it("should handle deeply nested transformations", () => {
            const obj = {
                a: {
                    b: {
                        c: { value: 1 },
                    },
                },
            };

            const result = deepTransform(obj, {
                a: { b: { c: { value: 100 } } },
            });

            expect(result.a.b.c.value).toBe(100);
        });
    });

    describe("literal value transformers", () => {
        it("should replace with literal values", () => {
            const obj = { name: "old", active: false };

            const result = deepTransform(obj, {
                name: "new",
                active: true,
            });

            expect(result).toEqual({ name: "new", active: true });
        });
    });

    describe("preservation of untransformed properties", () => {
        it("should preserve properties not in transformers", () => {
            const obj = { a: 1, b: 2, c: 3 };

            const result = deepTransform(obj, { a: 10 });

            expect(result).toEqual({ a: 10, b: 2, c: 3 });
        });
    });

    describe("edge cases", () => {
        it("should return primitive values unchanged", () => {
            expect(deepTransform(null, {})).toBe(null);
            expect(deepTransform("string", {})).toBe("string");
            expect(deepTransform(123, {})).toBe(123);
        });

        it("should handle arrays", () => {
            const arr = [1, 2, 3];

            const result = deepTransform(arr, { 0: 10 });

            expect(result).toEqual([10, 2, 3]);
            expect(arr).toEqual([1, 2, 3]); // original unchanged
        });

        it("should handle empty objects", () => {
            expect(deepTransform({}, { a: 1 })).toEqual({ a: 1 });
        });

        it("should create nested structure if missing", () => {
            const obj = {};

            const result = deepTransform(obj, {
                nested: { value: 42 },
            });

            expect(result.nested).toEqual({ value: 42 });
        });
    });
});

describe("isContentAvailableAsBloks - component content check", () => {
    it("should return true for bloks content with whitelist", () => {
        const component = {
            schema: {
                content: {
                    type: "bloks",
                    component_whitelist: ["hero", "card"],
                },
            },
        };

        expect(isContentAvailableAsBloks(component)).toBe(true);
    });

    it("should return false when content is not bloks type", () => {
        const component = {
            schema: {
                content: {
                    type: "text",
                    component_whitelist: ["hero"],
                },
            },
        };

        expect(isContentAvailableAsBloks(component)).toBe(false);
    });

    it("should return falsy when no whitelist", () => {
        const component = {
            schema: {
                content: {
                    type: "bloks",
                },
            },
        };

        expect(isContentAvailableAsBloks(component)).toBeFalsy();
    });

    it("should return false when no content field", () => {
        const component = {
            schema: {
                items: { type: "bloks" },
            },
        };

        expect(isContentAvailableAsBloks(component)).toBe(false);
    });
});

describe("isItemsAvailableAsBloks - component items check", () => {
    it("should return true for bloks items with whitelist", () => {
        const component = {
            schema: {
                items: {
                    type: "bloks",
                    component_whitelist: ["hero", "card"],
                },
            },
        };

        expect(isItemsAvailableAsBloks(component)).toBe(true);
    });

    it("should return false when items is not bloks type", () => {
        const component = {
            schema: {
                items: {
                    type: "text",
                    component_whitelist: ["hero"],
                },
            },
        };

        expect(isItemsAvailableAsBloks(component)).toBe(false);
    });

    it("should return falsy when no whitelist", () => {
        const component = {
            schema: {
                items: {
                    type: "bloks",
                },
            },
        };

        expect(isItemsAvailableAsBloks(component)).toBeFalsy();
    });

    it("should return false when no items field", () => {
        const component = {
            schema: {
                content: { type: "bloks" },
            },
        };

        expect(isItemsAvailableAsBloks(component)).toBe(false);
    });
});
