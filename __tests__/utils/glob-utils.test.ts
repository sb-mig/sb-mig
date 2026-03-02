import { beforeEach, describe, expect, it, vi } from "vitest";

const { globSyncMock } = vi.hoisted(() => ({
    globSyncMock: vi.fn((): string[] => []),
}));

vi.mock("glob", () => ({
    globSync: globSyncMock,
}));

import {
    NESTED_NODE_MODULES_PATTERN,
    safeGlobSync,
} from "../../src/utils/glob-utils.js";

type CapturedOptions = {
    follow?: boolean;
    ignore?: string[] | string;
};

describe("safeGlobSync", () => {
    const getFirstCall = (): [string, CapturedOptions] => {
        expect(globSyncMock).toHaveBeenCalled();
        return globSyncMock.mock.calls[0] as unknown as [string, CapturedOptions];
    };

    beforeEach(() => {
        globSyncMock.mockReset();
    });

    it("enables follow by default and applies nested node_modules ignore", () => {
        globSyncMock.mockReturnValue(["/tmp/component.sb.js"]);

        const result = safeGlobSync("/tmp/**/[^_]*.sb.js");

        expect(result).toEqual(["/tmp/component.sb.js"]);
        expect(globSyncMock).toHaveBeenCalledTimes(1);

        const [pattern, options] = getFirstCall();
        expect(pattern).toBe("/tmp/**/[^_]*.sb.js");
        expect(options).toMatchObject({
            follow: true,
            ignore: [NESTED_NODE_MODULES_PATTERN],
        });
    });

    it("preserves explicit follow=false", () => {
        safeGlobSync("/tmp/**/[^_]*.sb.js", { follow: false });

        const [, options] = getFirstCall();
        expect(options.follow).toBe(false);
    });

    it("merges existing ignore entries", () => {
        safeGlobSync("/tmp/**/[^_]*.sb.js", {
            ignore: ["**/dist/**"],
        });

        const [, options] = getFirstCall();
        expect(options.ignore).toEqual([
            "**/dist/**",
            NESTED_NODE_MODULES_PATTERN,
        ]);
    });

    it("normalizes string ignore to array", () => {
        safeGlobSync("/tmp/**/[^_]*.sb.js", {
            ignore: "**/.cache/**",
        });

        const [, options] = getFirstCall();
        expect(options.ignore).toEqual([
            "**/.cache/**",
            NESTED_NODE_MODULES_PATTERN,
        ]);
    });
});
