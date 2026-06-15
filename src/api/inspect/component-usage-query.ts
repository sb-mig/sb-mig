import type { ComponentUsageQuery } from "./component-usage.types.js";

import path from "path";

import storyblokConfig from "../../config/config.js";
import { toImportSpecifier } from "../../utils/files.js";
import { safeGlobSync as globSync } from "../../utils/glob-utils.js";
import { normalizeDiscover } from "../../utils/path-utils.js";

const QUERY_EXTENSIONS = [
    "sb.query.js",
    "sb.query.cjs",
    "sb.query.mjs",
] as const;

const isDirectQueryPath = (queryNameOrPath: string): boolean =>
    queryNameOrPath.includes("/") ||
    queryNameOrPath.includes("\\") ||
    QUERY_EXTENSIONS.some((ext) => queryNameOrPath.endsWith(`.${ext}`));

const withoutKnownQueryExtension = (queryName: string): string => {
    for (const ext of QUERY_EXTENSIONS) {
        const suffix = `.${ext}`;
        if (queryName.endsWith(suffix)) {
            return queryName.slice(0, -suffix.length);
        }
    }

    return queryName;
};

const querySearchDirectories = (): string[] =>
    storyblokConfig.componentsDirectories.filter(
        (directory: string) => !directory.includes("node_modules"),
    );

export const discoverComponentUsageQueryFiles = (
    queryName: string,
): string[] => {
    const rootDirectory = path.resolve(process.cwd(), "./");
    const searchDirectories = querySearchDirectories();
    const normalizedQueryName = withoutKnownQueryExtension(queryName);

    return QUERY_EXTENSIONS.flatMap((ext) => {
        const pattern = path.join(
            rootDirectory,
            normalizeDiscover({ segments: searchDirectories }),
            "**",
            `${normalizedQueryName}.${ext}`,
        );

        return globSync(pattern.replace(/\\/g, "/"), {
            follow: true,
        });
    });
};

function assertValidQuery(
    query: unknown,
    sourcePath: string,
): asserts query is ComponentUsageQuery {
    if (!query || typeof query !== "object") {
        throw new Error(`Query file '${sourcePath}' must export an object.`);
    }

    const candidate = query as Partial<ComponentUsageQuery>;

    if (typeof candidate.name !== "string" || candidate.name.length === 0) {
        throw new Error(
            `Query file '${sourcePath}' must export a non-empty 'name'.`,
        );
    }

    if (typeof candidate.match !== "function") {
        throw new Error(
            `Query file '${sourcePath}' must export a 'match' function.`,
        );
    }
}

export const loadComponentUsageQueryFromPath = async (
    queryPath: string,
): Promise<ComponentUsageQuery> => {
    const resolvedPath = path.isAbsolute(queryPath)
        ? queryPath
        : path.resolve(process.cwd(), queryPath);
    const module = await import(
        /* @vite-ignore */ toImportSpecifier(resolvedPath)
    );
    const query = module.default || module;

    assertValidQuery(query, resolvedPath);

    return query;
};

export const loadComponentUsageQuery = async (
    queryNameOrPath: string,
): Promise<ComponentUsageQuery> => {
    if (!queryNameOrPath || queryNameOrPath.trim().length === 0) {
        throw new Error("--query is required for inspect component-usage.");
    }

    if (isDirectQueryPath(queryNameOrPath)) {
        return loadComponentUsageQueryFromPath(queryNameOrPath);
    }

    const discoveredFiles = discoverComponentUsageQueryFiles(queryNameOrPath);

    if (discoveredFiles.length === 0) {
        throw new Error(
            `No component usage query found for '${queryNameOrPath}'. Expected a file named '${queryNameOrPath}.sb.query.js', '${queryNameOrPath}.sb.query.cjs', or '${queryNameOrPath}.sb.query.mjs' in configured component directories.`,
        );
    }

    if (discoveredFiles.length > 1) {
        throw new Error(
            `Multiple component usage queries found for '${queryNameOrPath}': ${discoveredFiles.join(", ")}`,
        );
    }

    return loadComponentUsageQueryFromPath(discoveredFiles[0] as string);
};
