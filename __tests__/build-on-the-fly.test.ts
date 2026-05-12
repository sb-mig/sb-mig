import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import path from "path";

import { describe, it, expect } from "vitest";

import { buildOnTheFly } from "../src/rollup/build-on-the-fly.js";
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

    it("resolves extensionless TypeScript schema imports and tsconfig path aliases", async () => {
        const tempDirectory = await mkdtemp(
            path.join(tmpdir(), "sb-mig-build-"),
        );

        try {
            await mkdir(path.join(tempDirectory, "src", "plugin-schemas"), {
                recursive: true,
            });

            await writeFile(
                path.join(tempDirectory, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        baseUrl: ".",
                        paths: {
                            "@/*": ["src/*"],
                        },
                    },
                }),
            );

            await writeFile(
                path.join(
                    tempDirectory,
                    "src",
                    "plugin-schemas",
                    "breakpoints.schema.ts",
                ),
                `
                    export const breakpointsSchema = {
                        spacing: { type: "custom", field_type: "spacing" },
                    };
                `,
            );

            await writeFile(
                path.join(tempDirectory, "src", "shared.schema.ts"),
                `
                    export const sharedSchema = {
                        color: { type: "custom", field_type: "color" },
                    };
                `,
            );

            const schemaFile = path.join(
                tempDirectory,
                "src",
                "example.sb.ts",
            );

            await writeFile(
                schemaFile,
                `
                    import { breakpointsSchema } from "./plugin-schemas/breakpoints.schema";
                    import { sharedSchema } from "@/shared.schema";

                    export default {
                        name: "example",
                        schema: {
                            design: {
                                type: "custom",
                                options: [
                                    {
                                        name: "spacing",
                                        value: JSON.stringify(breakpointsSchema.spacing),
                                    },
                                    {
                                        name: "color",
                                        value: JSON.stringify(sharedSchema.color),
                                    },
                                ],
                            },
                        },
                    };
                `,
            );

            await buildOnTheFly({
                files: [schemaFile],
                projectDir: tempDirectory,
            });

            const compiledFile = path.join(
                tempDirectory,
                ".next",
                "cache",
                "sb-mig",
                "example.sb.cjs",
            );
            const compiledContent = await readFile(compiledFile, "utf8");
            const require = createRequire(import.meta.url);
            const requiredSchema = require(compiledFile);
            const compiledSchema = requiredSchema.default ?? requiredSchema;

            expect(compiledContent).not.toContain(
                "./plugin-schemas/breakpoints.schema",
            );
            expect(compiledContent).not.toContain("@/shared.schema");
            expect(compiledSchema.schema.design.options).toHaveLength(2);
        } finally {
            await rm(tempDirectory, { recursive: true, force: true });
        }
    });
});
