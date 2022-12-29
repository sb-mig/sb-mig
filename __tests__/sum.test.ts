import { assert } from "chai";
import { sum } from "../src/utils/files.js";

describe("Calculator Tests", () => {
    it("should return 5 when 2 is added to 3", () => {
        const result = sum(2, 3);
        assert.equal(result, 5);
    });
    it("this should fail", () => {
        const result = sum(2, 3);
        assert.notEqual(result, 2);
    });
});