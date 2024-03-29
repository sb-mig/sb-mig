import {assert} from "chai";

import {unpackElements, unpackOne} from "../src/utils/main.js";
import {generateDatestamp} from "../src/utils/others.js";

const isValidString = (s: string) => {
    const pattern = /^(\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2})$/;
    return pattern.test(s);
}

describe("General Utils", () => {
    it("unpackElements works OK for command: 'sync components sb-blockquote sb-card'", () => {
        const elements = ["sync", "components", "sb-blockquote", "sb-card"]

        const componentNames = unpackElements(elements)

        assert.deepEqual(componentNames, ["sb-blockquote", "sb-card"]);
        assert.equal(componentNames.length, 2);
    });

    it("unpackElements works OK for command: 'sync components sb-blockquote'", () => {
        const elements = ["sync", "components", "sb-blockquote"]

        const componentNames = unpackElements(elements)

        assert.deepEqual(componentNames, ["sb-blockquote"]);
        assert.equal(componentNames.length, 1);
    });

    it("unpackElements works OK for command: 'sync components'", () => {
        const elements = ["sync", "components"]

        const componentNames = unpackElements(elements)

        assert.deepEqual(componentNames, []);
        assert.equal(componentNames.length, 0);
    });

    it("unpackOne works OK for command: 'sync components sb-blockquote' (will return only last element)", () => {
        const elements = ["sync", "components", 'sb-blockquote']

        const componentNames = unpackOne(elements)

        assert.equal(componentNames, "sb-blockquote");
    });

    it("generateDatestamp generates OK datestamp", () => {
        const date = "2022-02-02T22:18:46.499Z"

        const stamp = generateDatestamp(new Date(date))

        const result = isValidString(stamp)
        assert.isTrue(result)
    });
});