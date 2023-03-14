import {assert} from "chai";
import {_extractComponentName} from "../src/rollup/build-on-the-fly.js";

describe("Build Typescript on-the-fly", () => {
    if (process.platform === "win32") {
        it("WINDOWS: _extractComponentName return OK filename (removes .sb.ts and beggining)", () => {
            const windowsFilePath = "C:/Users/username/Desktop/example.sb.ts" // this will be already from glob, which is unix slash not windows slash
            assert.equal(_extractComponentName(windowsFilePath), 'example');
        });
    } else if (process.platform === "darwin") {
        it("MAC OS / UBUNTU: _extractComponentName return OK filename (removes .sb.ts and beggining)", () => {
            const filePath = "/Users/marckraw/Projects/amazing-project/src/components/card.sb.ts"
            const filePath2 = "/Users/marckraw/Projects/amazing-project/src/components/something-amazing.sb.ts"
            const filePath3 = "/Users/marckraw/Projects/amazing-project/src/components/good.super.sb.ts"

            assert.equal(_extractComponentName(filePath), 'card');
            assert.equal(_extractComponentName(filePath2), 'something-amazing');
            assert.equal(_extractComponentName(filePath3), 'good.super');
        });
    }
});