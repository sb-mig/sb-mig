import * as glob from "glob";

type GlobSync = typeof glob.globSync;

export type GlobSyncOptions = {
    follow?: boolean;
    ignore?: string | string[];
};

const resolvedGlobSync =
    (glob as unknown as { globSync?: GlobSync }).globSync ??
    (glob as unknown as { sync?: GlobSync }).sync ??
    (
        glob as unknown as {
            default?: { globSync?: GlobSync };
        }
    ).default?.globSync ??
    (glob as unknown as { default?: { sync?: GlobSync } }).default?.sync;

if (!resolvedGlobSync) {
    throw new Error(
        "Unable to resolve globSync from 'glob'. Please ensure a compatible glob version is installed.",
    );
}

export const NESTED_NODE_MODULES_PATTERN = "**/node_modules/**/node_modules/**";

export const safeGlobSync = (
    pattern: string,
    options?: GlobSyncOptions,
): string[] => {
    const ignore = options?.ignore
        ? Array.isArray(options.ignore)
            ? options.ignore
            : [options.ignore]
        : [];

    const result = resolvedGlobSync(pattern, {
        ...options,
        follow: options?.follow ?? true,
        // Avoid traversing nested node_modules trees, which can explode memory usage.
        ignore: [...ignore, NESTED_NODE_MODULES_PATTERN],
    } as Parameters<GlobSync>[1]);

    return result as string[];
};
