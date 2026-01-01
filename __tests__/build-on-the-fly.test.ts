import { describe, it, expect } from "vitest";

import { _extractComponentName } from "../src/rollup/build-on-the-fly.js";

describe("Build Typescript on-the-fly", () => {
    if (process.platform === "win32") {
        it("WINDOWS: _extractComponentName return OK filename (removes .sb.ts and beginning)", () => {
            const windowsFilePath = "C:/Users/username/Desktop/example.sb.ts"; // this will be already from glob, which is unix slash not windows slash
            expect(_extractComponentName(windowsFilePath)).toBe("example.sb");
        });
    } else if (process.platform === "darwin" || process.platform === "linux") {
        it("MAC OS / UBUNTU: _extractComponentName return OK filename (removes .sb.ts and beginning)", () => {
            const filePath =
                "/Users/marckraw/Projects/amazing-project/src/components/card.sb.ts";
            const filePath2 =
                "/Users/marckraw/Projects/amazing-project/src/components/something-amazing.sb.ts";
            const filePath3 =
                "/Users/marckraw/Projects/amazing-project/src/components/good.super.sb.ts";

            expect(_extractComponentName(filePath)).toBe("card.sb");
            expect(_extractComponentName(filePath2)).toBe(
                "something-amazing.sb",
            );
            expect(_extractComponentName(filePath3)).toBe("good.super.sb");
        });
    }
});
