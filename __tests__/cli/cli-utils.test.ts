import { describe, it, expect } from "vitest";

import {
    prop,
    pipe,
    unpackElements,
    unpackOne,
    isItFactory,
    getFrom,
    getTo,
    getSourceSpace,
    getTargetSpace,
    getWhat,
    getWhere,
    getRecursive,
} from "../../src/cli/utils/cli-utils.js";

describe("prop - property accessor", () => {
    it("should return the value of a property from an object", () => {
        const obj = { name: "hero", id: 123 };

        expect(prop("name")(obj)).toBe("hero");
        expect(prop("id")(obj)).toBe(123);
    });

    it("should return undefined for non-existent properties", () => {
        const obj = { name: "hero" };

        expect(prop("nonexistent")(obj)).toBeUndefined();
    });

    it("should work with nested objects", () => {
        const obj = { data: { value: 42 } };

        expect(prop("data")(obj)).toEqual({ value: 42 });
    });

    it("should work with arrays", () => {
        const arr = ["a", "b", "c"];

        expect(prop(0)(arr)).toBe("a");
        expect(prop(2)(arr)).toBe("c");
    });
});

describe("pipe - function composition", () => {
    it("should pipe functions left to right", () => {
        const addOne = (x: number) => x + 1;
        const double = (x: number) => x * 2;

        const addOneThenDouble = pipe(addOne, double);

        expect(addOneThenDouble(5)).toBe(12); // (5 + 1) * 2 = 12
    });

    it("should work with single function", () => {
        const addOne = (x: number) => x + 1;

        const piped = pipe(addOne);

        expect(piped(5)).toBe(6);
    });

    it("should work with multiple functions", () => {
        const addOne = (x: number) => x + 1;
        const double = (x: number) => x * 2;
        const square = (x: number) => x * x;

        const composed = pipe(addOne, double, square);

        expect(composed(2)).toBe(36); // ((2 + 1) * 2)^2 = 36
    });

    it("should work with string transformations", () => {
        const toUpper = (s: string) => s.toUpperCase();
        const addExclaim = (s: string) => s + "!";

        const shout = pipe(toUpper, addExclaim);

        expect(shout("hello")).toBe("HELLO!");
    });
});

describe("unpackElements - CLI input parsing", () => {
    it("should extract elements after first two", () => {
        const input = ["sync", "components", "hero", "card", "footer"];

        expect(unpackElements(input)).toEqual(["hero", "card", "footer"]);
    });

    it("should return single element when only one provided", () => {
        const input = ["sync", "components", "hero"];

        expect(unpackElements(input)).toEqual(["hero"]);
    });

    it("should return empty array when no elements after command", () => {
        const input = ["sync", "components"];

        expect(unpackElements(input)).toEqual([]);
    });

    it("should handle empty input", () => {
        const input: string[] = [];

        expect(unpackElements(input)).toEqual([]);
    });
});

describe("unpackOne - single element extraction", () => {
    it("should extract the third element", () => {
        const input = ["sync", "components", "hero"];

        expect(unpackOne(input)).toBe("hero");
    });

    it("should return undefined when no third element", () => {
        const input = ["sync", "components"];

        expect(unpackOne(input)).toBeUndefined();
    });

    it("should only return first element after command even if more exist", () => {
        const input = ["sync", "components", "hero", "card"];

        expect(unpackOne(input)).toBe("hero");
    });
});

describe("isItFactory - flag matching", () => {
    const rules = {
        all: ["all"],
        allWithPresets: ["all", "presets"],
        allWithSSOT: ["all", "ssot"],
        onlyPresets: ["presets"],
        empty: [],
    };

    it("should match exact single flag", () => {
        const flags = { all: true };
        const isIt = isItFactory(flags, rules, []);

        expect(isIt("all")).toBe(true);
        expect(isIt("allWithPresets")).toBe(false);
        expect(isIt("onlyPresets")).toBe(false);
    });

    it("should match exact multiple flags", () => {
        const flags = { all: true, presets: true };
        const isIt = isItFactory(flags, rules, []);

        expect(isIt("all")).toBe(false);
        expect(isIt("allWithPresets")).toBe(true);
    });

    it("should ignore whitelisted flags when matching", () => {
        const flags = { from: "12345", to: "67890", all: true };
        const isIt = isItFactory(flags, rules, ["from", "to"]);

        expect(isIt("all")).toBe(true);
    });

    it("should match empty rule when no relevant flags", () => {
        const flags = { from: "12345", to: "67890" };
        const isIt = isItFactory(flags, rules, ["from", "to"]);

        expect(isIt("empty")).toBe(true);
    });

    it("should not match when extra flags present", () => {
        const flags = { all: true, presets: true, ssot: true };
        const isIt = isItFactory(flags, rules, []);

        // No rule matches all three flags
        expect(isIt("all")).toBe(false);
        expect(isIt("allWithPresets")).toBe(false);
        expect(isIt("allWithSSOT")).toBe(false);
    });

    it("should handle SSOT flag", () => {
        const flags = { all: true, ssot: true };
        const isIt = isItFactory(flags, rules, []);

        expect(isIt("allWithSSOT")).toBe(true);
        expect(isIt("all")).toBe(false);
    });
});

// ============================================================================
// CLI Flag Extractors
// ============================================================================

describe("getFrom - source space ID extraction", () => {
    const mockConfig = { spaceId: "default-space-123" } as any;

    it("should return from flag when provided", () => {
        const flags = { from: "custom-space-456" };

        expect(getFrom(flags, mockConfig)).toBe("custom-space-456");
    });

    it("should fall back to config spaceId when from not provided", () => {
        const flags = {};

        expect(getFrom(flags, mockConfig)).toBe("default-space-123");
    });

    it("should convert numeric spaceId to string", () => {
        const flags = { from: 12345 };

        expect(getFrom(flags, mockConfig)).toBe("12345");
    });

    it("should handle undefined from flag", () => {
        const flags = { from: undefined };

        expect(getFrom(flags, mockConfig)).toBe("default-space-123");
    });
});

describe("getTo - target space ID extraction", () => {
    const mockConfig = { spaceId: "default-space-123" } as any;

    it("should return to flag when provided", () => {
        const flags = { to: "target-space-789" };

        expect(getTo(flags, mockConfig)).toBe("target-space-789");
    });

    it("should fall back to config spaceId when to not provided", () => {
        const flags = {};

        expect(getTo(flags, mockConfig)).toBe("default-space-123");
    });

    it("should convert numeric spaceId to string", () => {
        const flags = { to: 67890 };

        expect(getTo(flags, mockConfig)).toBe("67890");
    });
});

describe("getSourceSpace - source space ID extraction", () => {
    const mockConfig = { spaceId: "default-space-123" } as any;

    it("should return sourceSpace flag when provided", () => {
        const flags = { sourceSpace: "source-456" };

        expect(getSourceSpace(flags, mockConfig)).toBe("source-456");
    });

    it("should fall back to config spaceId when sourceSpace not provided", () => {
        const flags = {};

        expect(getSourceSpace(flags, mockConfig)).toBe("default-space-123");
    });

    it("should convert numeric value to string", () => {
        const flags = { sourceSpace: 11111 };

        expect(getSourceSpace(flags, mockConfig)).toBe("11111");
    });
});

describe("getTargetSpace - target space ID extraction", () => {
    const mockConfig = { spaceId: "default-space-123" } as any;

    it("should return targetSpace flag when provided", () => {
        const flags = { targetSpace: "target-789" };

        expect(getTargetSpace(flags, mockConfig)).toBe("target-789");
    });

    it("should fall back to config spaceId when targetSpace not provided", () => {
        const flags = {};

        expect(getTargetSpace(flags, mockConfig)).toBe("default-space-123");
    });

    it("should convert numeric value to string", () => {
        const flags = { targetSpace: 22222 };

        expect(getTargetSpace(flags, mockConfig)).toBe("22222");
    });
});

describe("getWhat - what flag extraction", () => {
    it("should return what flag when provided", () => {
        const flags = { what: "components" };

        expect(getWhat(flags)).toBe("components");
    });

    it("should return 'all' as default when what not provided", () => {
        const flags = {};

        expect(getWhat(flags)).toBe("all");
    });

    it("should handle different what values", () => {
        expect(getWhat({ what: "stories" })).toBe("stories");
        expect(getWhat({ what: "datasources" })).toBe("datasources");
        expect(getWhat({ what: "roles" })).toBe("roles");
    });
});

describe("getWhere - where flag extraction", () => {
    it("should return where flag when provided", () => {
        const flags = { where: "local" };

        expect(getWhere(flags)).toBe("local");
    });

    it("should return 'all' as default when where not provided", () => {
        const flags = {};

        expect(getWhere(flags)).toBe("all");
    });

    it("should handle different where values", () => {
        expect(getWhere({ where: "external" })).toBe("external");
        expect(getWhere({ where: "node_modules" })).toBe("node_modules");
    });
});

describe("getRecursive - recursive flag extraction", () => {
    it("should return true when recursive flag is true", () => {
        const flags = { recursive: true };

        expect(getRecursive(flags)).toBe(true);
    });

    it("should return false when recursive flag is false", () => {
        const flags = { recursive: false };

        expect(getRecursive(flags)).toBe(false);
    });

    it("should return false as default when recursive not provided", () => {
        const flags = {};

        expect(getRecursive(flags)).toBe(false);
    });

    it("should return false for undefined recursive flag", () => {
        const flags = { recursive: undefined };

        expect(getRecursive(flags)).toBe(false);
    });
});
