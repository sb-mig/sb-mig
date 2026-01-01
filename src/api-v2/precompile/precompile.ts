import { mkdir, rm } from "fs/promises";
import path from "path";

import { rollup, type RollupOptions } from "rollup";
import ts from "rollup-plugin-ts";

/**
 * Options for precompiling TypeScript schema files
 */
export interface PrecompileOptions {
    /** Directory to store compiled files (defaults to .sb-mig-cache) */
    cacheDir?: string;
    /** Whether to clear cache before compiling (defaults to true) */
    flushCache?: boolean;
    /** Project directory (defaults to process.cwd()) */
    projectDir?: string;
}

/**
 * Result of precompiling files
 */
export interface PrecompileResult {
    /** Successfully compiled files with their output paths */
    compiled: Array<{
        input: string;
        outputCjs: string;
        outputEsm: string;
    }>;
    /** Files that failed to compile */
    errors: Array<{
        input: string;
        error: string;
    }>;
}

/**
 * Extract the component name from a file path
 * e.g., "/path/to/my-component.sb.ts" -> "my-component.sb"
 */
export const extractComponentName = (filePath: string): string => {
    const separator = "/";
    const parts = filePath.split(separator);
    const lastElement = parts[parts.length - 1] as string;
    return lastElement.replace(/\.ts$/, "");
};

/**
 * Build a single file using Rollup
 */
async function buildFile(
    inputPath: string,
    outputCjs: string,
    outputEsm: string,
): Promise<void> {
    const inputOptions: RollupOptions = {
        input: inputPath,
        plugins: [
            ts({
                transpileOnly: true,
                transpiler: "swc",
            }),
        ],
    };

    const outputOptionsList = [
        { file: outputCjs, format: "cjs" as const },
        { file: outputEsm, format: "es" as const },
    ];

    let bundle;
    try {
        bundle = await rollup(inputOptions);

        for (const outputOptions of outputOptionsList) {
            await bundle.write(outputOptions);
        }
    } finally {
        if (bundle) {
            await bundle.close();
        }
    }
}

/**
 * Precompile TypeScript schema files to JavaScript
 *
 * This uses Rollup with SWC for fast transpilation, producing
 * both CommonJS (.cjs) and ESM (.js) outputs.
 *
 * @param files - Array of TypeScript file paths to compile
 * @param options - Precompile options
 * @returns Result with compiled files and any errors
 *
 * @example
 * ```ts
 * const result = await precompile([
 *   '/path/to/hero.sb.ts',
 *   '/path/to/card.sb.ts',
 * ], { cacheDir: '.cache/sb-mig' });
 *
 * // Use compiled CJS files
 * for (const compiled of result.compiled) {
 *   const content = require(compiled.outputCjs);
 * }
 * ```
 */
export async function precompile(
    files: string[],
    options: PrecompileOptions = {},
): Promise<PrecompileResult> {
    const {
        cacheDir = ".sb-mig-cache",
        flushCache = true,
        projectDir = process.cwd(),
    } = options;

    const fullCacheDir = path.join(projectDir, cacheDir, "sb-mig");

    // Optionally clear cache
    if (flushCache) {
        try {
            await rm(fullCacheDir, { recursive: true, force: true });
        } catch {
            // Ignore if doesn't exist
        }
    }

    // Ensure cache directory exists
    await mkdir(fullCacheDir, { recursive: true });

    const result: PrecompileResult = {
        compiled: [],
        errors: [],
    };

    // Filter to only TypeScript files
    const tsFiles = files.filter((f) => f.endsWith(".ts"));

    if (tsFiles.length === 0) {
        return result;
    }

    // Compile all files in parallel
    await Promise.all(
        tsFiles.map(async (inputPath) => {
            const componentName = extractComponentName(inputPath);
            const outputCjs = path.join(fullCacheDir, `${componentName}.cjs`);
            const outputEsm = path.join(fullCacheDir, `${componentName}.js`);

            try {
                await buildFile(inputPath, outputCjs, outputEsm);
                result.compiled.push({
                    input: inputPath,
                    outputCjs,
                    outputEsm,
                });
            } catch (error) {
                result.errors.push({
                    input: inputPath,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }),
    );

    return result;
}

/**
 * Get the compiled file path for a TypeScript source file
 *
 * @param tsFilePath - Original .ts file path
 * @param options - Options with cacheDir and projectDir
 * @param format - Output format ('cjs' or 'esm')
 * @returns Path to the compiled file
 */
export function getCompiledPath(
    tsFilePath: string,
    options: PrecompileOptions = {},
    format: "cjs" | "esm" = "cjs",
): string {
    const { cacheDir = ".sb-mig-cache", projectDir = process.cwd() } = options;

    const fullCacheDir = path.join(projectDir, cacheDir, "sb-mig");
    const componentName = extractComponentName(tsFilePath);
    const ext = format === "cjs" ? ".cjs" : ".js";

    return path.join(fullCacheDir, `${componentName}${ext}`);
}
