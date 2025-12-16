import { describe, it, expect } from "vitest";

import { unpackElements, unpackOne } from "../src/utils/main.js";
import { generateDatestamp } from "../src/utils/others.js";

const isValidString = (s: string) => {
    const pattern = /^(\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2})$/;
    return pattern.test(s);
};

describe("General Utils", () => {
    it("unpackElements works OK for command: 'sync components sb-blockquote sb-card'", () => {
        const elements = ["sync", "components", "sb-blockquote", "sb-card"];

        const componentNames = unpackElements(elements);

        expect(componentNames).toEqual(["sb-blockquote", "sb-card"]);
        expect(componentNames.length).toBe(2);
    });

    it("unpackElements works OK for command: 'sync components sb-blockquote'", () => {
        const elements = ["sync", "components", "sb-blockquote"];

        const componentNames = unpackElements(elements);

        expect(componentNames).toEqual(["sb-blockquote"]);
        expect(componentNames.length).toBe(1);
    });

    it("unpackElements works OK for command: 'sync components'", () => {
        const elements = ["sync", "components"];

        const componentNames = unpackElements(elements);

        expect(componentNames).toEqual([]);
        expect(componentNames.length).toBe(0);
    });

    it("unpackOne works OK for command: 'sync components sb-blockquote' (will return only last element)", () => {
        const elements = ["sync", "components", "sb-blockquote"];

        const componentNames = unpackOne(elements);

        expect(componentNames).toBe("sb-blockquote");
    });

    it("generateDatestamp generates OK datestamp", () => {
        const date = "2022-02-02T22:18:46.499Z";

        const stamp = generateDatestamp(new Date(date));

        const result = isValidString(stamp);
        expect(result).toBe(true);
    });
});
