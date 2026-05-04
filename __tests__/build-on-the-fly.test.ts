import { describe, it, expect } from "vitest";

import { extractComponentName as _extractComponentName } from "../src/utils/path-utils.js";

describe("Build Typescript on-the-fly", () => {
    // These tests are platform-independent: extractComponentName must handle
    // both `\` and `/` regardless of the runtime OS, because glob v11 returns
    // native-separator paths on Windows even when given a POSIX-style pattern.
    describe("extractComponentName", () => {
        it("handles Windows backslash paths", () => {
            expect(
                _extractComponentName(
                    "C:\\Users\\username\\Desktop\\example.sb.ts",
                ),
            ).toBe("example.sb");
            expect(
                _extractComponentName(
                    "C:\\Users\\me\\project\\src\\components\\hero.sb.ts",
                ),
            ).toBe("hero.sb");
        });

        it("handles Windows forward-slash paths (drive-letter)", () => {
            expect(
                _extractComponentName("C:/Users/username/Desktop/example.sb.ts"),
            ).toBe("example.sb");
        });

        it("handles POSIX forward-slash paths", () => {
            expect(
                _extractComponentName(
                    "/Users/marckraw/Projects/amazing-project/src/components/card.sb.ts",
                ),
            ).toBe("card.sb");
            expect(
                _extractComponentName(
                    "/Users/marckraw/Projects/amazing-project/src/components/something-amazing.sb.ts",
                ),
            ).toBe("something-amazing.sb");
        });

        it("preserves dots in the file name and only strips trailing .ts", () => {
            expect(
                _extractComponentName(
                    "/Users/marckraw/Projects/amazing-project/src/components/good.super.sb.ts",
                ),
            ).toBe("good.super.sb");
            // .ts in the middle of the name must not be stripped
            expect(_extractComponentName("/foo/bar/x.tsx.sb.ts")).toBe(
                "x.tsx.sb",
            );
        });

        it("handles bare file names (no separator)", () => {
            expect(_extractComponentName("hero.sb.ts")).toBe("hero.sb");
        });
    });
});
