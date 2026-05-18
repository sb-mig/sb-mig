import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildOnTheFlyMock, configMock, globSyncMock } = vi.hoisted(() => ({
    buildOnTheFlyMock: vi.fn(),
    configMock: {
        componentsDirectories: ["src/components", "src/storyblok"],
        schemaFileExt: "sb.js",
        schemaType: "js",
    },
    globSyncMock: vi.fn((_pattern: string): string[] => []),
}));

vi.mock("../../src/config/config.js", () => ({
    default: configMock,
    SCHEMA: {
        JS: "js",
        TS: "ts",
    },
}));

vi.mock("../../src/rollup/build-on-the-fly.js", () => ({
    buildOnTheFly: buildOnTheFlyMock,
}));

vi.mock("../../src/utils/glob-utils.js", () => ({
    safeGlobSync: globSyncMock,
}));

const { discoverMany, SCOPE, LOOKUP_TYPE } = await import(
    "../../src/cli/utils/discover.js"
);

describe("discoverMany", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configMock.componentsDirectories = ["src/components", "src/storyblok"];
        configMock.schemaFileExt = "sb.js";
        configMock.schemaType = "js";
    });

    it("does not search the whole project for external components when no node_modules directories are configured", async () => {
        const result = await discoverMany({
            scope: SCOPE.external,
            type: LOOKUP_TYPE.fileName,
            fileNames: ["sb-button"],
        });

        expect(result).toEqual([]);
        expect(globSyncMock).not.toHaveBeenCalled();
    });

    it("uses configured external component directories for selected component names", async () => {
        if (process.platform === "win32") return expect(true).toBe(true);

        configMock.componentsDirectories = [
            "src/components",
            "../../node_modules/@ef-global",
            "./node_modules/@ef-global",
        ];
        globSyncMock.mockImplementation((pattern: string) => [pattern]);

        const result = await discoverMany({
            scope: SCOPE.external,
            type: LOOKUP_TYPE.fileName,
            fileNames: ["sb-button"],
        });

        const expectedPatterns = [
            path
                .join(
                    process.cwd(),
                    "../../node_modules/@ef-global",
                    "**",
                    "sb-button.sb.js",
                )
                .replace(/\\/g, "/"),
            path
                .join(
                    process.cwd(),
                    "./node_modules/@ef-global",
                    "**",
                    "sb-button.sb.js",
                )
                .replace(/\\/g, "/"),
        ];

        expect(globSyncMock).toHaveBeenCalledTimes(2);
        expect(globSyncMock.mock.calls.map(([pattern]) => pattern)).toEqual(
            expectedPatterns,
        );
        expect(result).toEqual(expectedPatterns);
    });
});
