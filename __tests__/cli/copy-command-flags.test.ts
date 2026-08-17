import { describe, it, expect, vi } from "vitest";

import Logger from "../../src/utils/logger.js";

// Unit-test the flag resolution helpers, exported from copy.ts.
const {
    resolveCopyRuntimeOptions,
    printCopySummary,
    buildCopyCommand,
    buildCopyAssetsCommand,
} = await import("../../src/cli/commands/copy.js");

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

    it("config rateLimit is ignored when no flag is set -- defaults to 6", () => {
        // storyblokConfig.rateLimit is a legacy global default for the
        // plain storyblok-js-client (e.g. 2, see defaultConfig.ts) -- copy
        // must not inherit it, or --rateLimit's documented default of 6
        // would be false whenever a project configured its own rateLimit.
        const options = resolveCopyRuntimeOptions({}, { rateLimit: 10 });
        expect(options.rateLimit).toBe(6);
    });

    it("parses verify and force-content in both spellings", () => {
        expect(resolveCopyRuntimeOptions({ verify: true }, {}).verify).toBe(
            true,
        );
        expect(
            resolveCopyRuntimeOptions({ "force-content": true }, {})
                .forceContent,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ forceContent: true }, {}).forceContent,
        ).toBe(true);
    });

    it("throws on a non-numeric --rateLimit instead of silently defaulting to 6", () => {
        expect(() =>
            resolveCopyRuntimeOptions({ rateLimit: "abc" }, {}),
        ).toThrow("--rateLimit must be a positive number.");
    });

    it("throws on a non-positive --rateLimit", () => {
        expect(() =>
            resolveCopyRuntimeOptions({ rateLimit: "0" }, {}),
        ).toThrow("--rateLimit must be a positive number.");
        expect(() =>
            resolveCopyRuntimeOptions({ rateLimit: "-3" }, {}),
        ).toThrow("--rateLimit must be a positive number.");
    });
});

describe("buildCopyCommand", () => {
    const baseArgs = {
        sourceSpace: "111",
        targetSpace: "222",
        selection: { source: "home", mode: "single" } as any,
        destination: undefined,
        dryRun: false,
    };

    it("round-trips manifestRoot, publicationMode, publicationLanguages and rateLimit on the resume line", () => {
        const command = buildCopyCommand({
            ...baseArgs,
            manifestRoot: "custom-manifests",
            publicationMode: "save-only",
            rateLimit: 12,
        });

        expect(command).toContain("--manifestRoot custom-manifests");
        expect(command).toContain("--publicationMode save-only");
        expect(command).toContain("--rateLimit 12");
    });

    it("serializes an array of publishLanguages as a comma-separated list", () => {
        const command = buildCopyCommand({
            ...baseArgs,
            publishLanguages: ["en", "fr"],
        });

        expect(command).toContain('--publicationLanguages "en,fr"');
    });

    it("omits --verify and --force-content even though they are runtime options", () => {
        const command = buildCopyCommand(baseArgs);

        expect(command).not.toContain("--verify");
        expect(command).not.toContain("--force-content");
    });
});

describe("buildCopyAssetsCommand", () => {
    it("round-trips manifestRoot and rateLimit on the resume line", () => {
        const command = buildCopyAssetsCommand({
            sourceSpace: "111",
            targetSpace: "222",
            selection: { type: "all" } as any,
            dryRun: false,
            manifestRoot: "custom-manifests",
            rateLimit: 9,
        });

        expect(command).toContain("--manifestRoot custom-manifests");
        expect(command).toContain("--rateLimit 9");
    });
});

describe("printCopySummary", () => {
    it("keeps fields separated by whitespace at real-world (5-digit) counts", () => {
        const logSpy = vi.spyOn(Logger, "log").mockImplementation(() => {});

        printCopySummary({
            stories: {
                created: 120,
                matched: 19880,
                skipped: 19850,
                failed: 3,
            },
            assetFolders: { created: 4, matched: 12, failed: 0 },
            assets: { created: 210, matched: 890, failed: 1 },
        });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const printed = logSpy.mock.calls[0][0] as string;

        // Every "name value" pair must be followed by whitespace before the
        // next field name -- i.e. no two adjacent numbers/words glued
        // together (the bug: padEnd(name.length + 6) collapsed to zero
        // separator once a value hit 5 digits, e.g. "matched19880failed").
        expect(printed).toMatch(
            /created 120\s+matched 19880\s+skipped 19850\s+failed 3/,
        );
        expect(printed).toMatch(/created 4\s+matched 12/);
        expect(printed).toMatch(/created 210\s+matched 890\s+failed 1/);
        expect(printed).not.toMatch(/\d(?:created|matched|skipped|failed)/);

        logSpy.mockRestore();
    });
});
