import path from "path";

import { describe, it, expect } from "vitest";

import { filesPattern, normalizeDiscover } from "../src/utils/path-utils.js";

describe("Discovering files", () => {
    it("pattern passed to glob work correctly for sb.ts extension for unix paths", () => {
        if (process.platform === "win32") return expect(true).toBe(true);
        const directory = path.join("Users", "someone", "Projects", "project");
        const componentsDirectories = ["src", "storyblok"];

        const pattern = filesPattern({
            mainDirectory: directory,
            componentDirectories: componentsDirectories,
            ext: "sb.ts",
        }).replace(/\\/g, "/");

        expect(pattern).toBe(
            "Users/someone/Projects/project/{src,storyblok}/**/[^_]*.sb.ts",
        );
    });

    it("pattern passed to glob work correctly for sb.ts extension for windows paths", () => {
        if (process.platform !== "win32") return expect(true).toBe(true);
        const directory = path.join("C:", "someone", "Projects", "project");
        const componentsDirectories = ["src", "storyblok"];

        const pattern = filesPattern({
            mainDirectory: directory,
            componentDirectories: componentsDirectories,
            ext: "sb.ts",
        }).replace(/\\/g, "/");

        expect(pattern).toBe(
            "C:/someone/Projects/project/{src,storyblok}/**/[^_]*.sb.ts",
        );
    });

    it("normalizeDiscover works OK for 2 segments", () => {
        const componentsDirectories = ["src", "storyblok"];

        const normalized = normalizeDiscover({
            segments: componentsDirectories,
        });

        expect(normalized).toBe("{src,storyblok}");
    });

    it("normalizeDiscover works OK for 1 segment", () => {
        const componentsDirectories = ["src"];

        const normalized = normalizeDiscover({
            segments: componentsDirectories,
        });

        expect(normalized).toBe("src");
    });

    it("normalizeDiscover works OK for 0 empty array of segments", () => {
        const componentsDirectories: string[] = [];

        const normalized = normalizeDiscover({
            segments: componentsDirectories,
        });

        expect(normalized).toBe("");
    });
});
