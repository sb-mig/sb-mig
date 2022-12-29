import {assert} from "chai";
import {normalizeDiscover} from "../src/utils/discover.js";

describe("Discovering files", () => {
    it("normalizeDiscover works OK for 2 segments", () => {
        const componentsDirectories = ["src", "storyblok"]

        const normalized = normalizeDiscover({
            segments: componentsDirectories
        })

        assert.equal(normalized, '{src,storyblok}');
    });

    it("normalizeDiscover works OK for 1 segment", () => {
        const componentsDirectories = ["src"]

        const normalized = normalizeDiscover({
            segments: componentsDirectories
        })

        assert.equal(normalized, 'src');
    });

    it("normalizeDiscover works OK for 0 empty array of segments", () => {
        const componentsDirectories: string[] = []

        const normalized = normalizeDiscover({
            segments: componentsDirectories
        })

        assert.equal(normalized, '');
    });

});