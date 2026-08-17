import { describe, it, expect, vi } from "vitest";

// Unit-test the flag resolution helpers, exported from copy.ts.
const { resolveCopyRuntimeOptions } = await import(
    "../../src/cli/commands/copy.js"
);

describe("resolveCopyRuntimeOptions", () => {
    it("defaults to rate 6, no verify, no forceContent", () => {
        const options = resolveCopyRuntimeOptions({}, {});
        expect(options.rateLimit).toBe(6);
        expect(options.verify).toBe(false);
        expect(options.forceContent).toBe(false);
        expect(options.writeConcurrency).toBe(12);
    });

    it("flag overrides config rateLimit", () => {
        const options = resolveCopyRuntimeOptions(
            { rateLimit: "3" },
            { rateLimit: 10 },
        );
        expect(options.rateLimit).toBe(3);
        expect(options.writeConcurrency).toBe(6);
    });

    it("config rateLimit applies when no flag is set", () => {
        const options = resolveCopyRuntimeOptions({}, { rateLimit: 10 });
        expect(options.rateLimit).toBe(10);
    });

    it("parses verify and force-content in both spellings", () => {
        expect(
            resolveCopyRuntimeOptions({ verify: true }, {}).verify,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ "force-content": true }, {})
                .forceContent,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ forceContent: true }, {}).forceContent,
        ).toBe(true);
    });
});
