import {assert} from "chai";
import {_extractComponentName} from "../src/rollup/build-on-the-fly.js";

describe("Build Typescript on-the-fly", () => {
    it("_extractComponentName return OK filename (removes .sb.ts and beggining)", () => {
        const filePath = "/Users/marckraw/Projects/amazing-project/src/components/card.sb.ts"
        const filePath2 = "/Users/marckraw/Projects/amazing-project/src/components/something-amazing.sb.ts"
        const filePath3 = "/Users/marckraw/Projects/amazing-project/src/components/good.super.sb.ts"
        const windowsFilePath = "C:\\Users\\username\\Desktop\\example.sb.ts"

        if (process.platform === "win32") {
            assert.equal(_extractComponentName(windowsFilePath), 'example');
        } else if (process.platform === "darwin") {
            assert.equal(_extractComponentName(filePath), 'card');
            assert.equal(_extractComponentName(filePath2), 'something-amazing');
            assert.equal(_extractComponentName(filePath3), 'good.super');
        }
    });
});