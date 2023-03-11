import {assert} from "chai";
import {filesPattern, normalizeDiscover} from "../src/utils/discover.js";
import path from "path";

describe("Discovering files", () => {
    it("pattern passed to glob work correctly for sb.ts extension for unix paths", () => {
        if(process.platform === "win32") return assert.ok(true);
        const directory = path.join('Users', 'someone', 'Projects', 'project');
        const componentsDirectories = ["src", "storyblok"]

        const pattern = filesPattern({
            mainDirectory: directory,
            componentDirectories: componentsDirectories,
            ext: "sb.ts",
        }).replace(/\\/g, "/");

        assert.equal(pattern, 'Users/someone/Projects/project/{src,storyblok}/**/[^_]*.sb.ts');
    });
    it("pattern passed to glob work correctly for sb.ts extension for windows paths", () => {
        if(process.platform !== "win32") return assert.ok(true);
        const directory = path.join('C:', 'someone', 'Projects', 'project');
        const componentsDirectories = ["src", "storyblok"]

        const pattern = filesPattern({
            mainDirectory: directory,
            componentDirectories: componentsDirectories,
            ext: "sb.ts",
        }).replace(/\\/g, "/");

        assert.equal(pattern, 'C:/someone/Projects/project/{src,storyblok}/**/[^_]*.sb.ts');
    });
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