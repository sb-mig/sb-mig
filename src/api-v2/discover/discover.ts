import { readdir, stat, readFile, realpath } from "fs/promises";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

export interface DiscoveredResource {
    name: string;
    filePath: string;
    type: "local" | "external";
}

export interface LoadedResource {
    name: string;
    filePath: string;
    data: any;
    error?: string;
}

/**
 * Load the content of a resource file (.sb.js, .datasource.js, etc.)
 * Uses dynamic import to load ES modules and CommonJS
 */
export async function loadResourceContent(filePath: string): Promise<any> {
    try {
        // Use dynamic import which works for both ESM and CJS
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);
        return module.default || module;
    } catch (error) {
        throw new Error(
            `Failed to load ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Load multiple resources by file path
 */
export async function loadResources(
    filePaths: string[],
): Promise<LoadedResource[]> {
    const results: LoadedResource[] = [];

    for (const filePath of filePaths) {
        const name =
            filePath
                .split("/")
                .pop()
                ?.replace(/\.sb\.(js|cjs|mjs|ts)$/, "")
                .replace(/\.(datasource|roles)\.(js|cjs|ts)$/, "")
                .replace(/\.sb\.(datasource|roles)\.(js|cjs|ts)$/, "") ||
            "unknown";

        try {
            const data = await loadResourceContent(filePath);
            results.push({ name, filePath, data });
        } catch (error) {
            results.push({
                name,
                filePath,
                data: null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return results;
}

/**
 * Read componentsDirectories from storyblok.config.js if it exists
 */
async function readComponentDirectories(workingDir: string): Promise<string[]> {
    const configFiles = [
        "storyblok.config.js",
        "storyblok.config.cjs",
        "storyblok.config.mjs",
    ];

    for (const configFile of configFiles) {
        try {
            const configPath = join(workingDir, configFile);
            const configContent = await readFile(configPath, "utf-8");

            const match = configContent.match(
                /componentsDirectories\s*:\s*\[([\s\S]*?)\]/,
            );
            if (match && match[1]) {
                const dirsMatch = match[1].match(/['"]([^'"]+)['"]/g);
                if (dirsMatch) {
                    return dirsMatch.map((d) => d.replace(/['"]/g, ""));
                }
            }
            break;
        } catch {
            // Config file doesn't exist, continue
        }
    }

    return ["src", "components", "storyblok"];
}

/**
 * Options for component discovery
 */
export interface DiscoverComponentsOptions {
    /** File extensions to search for (default: [".sb.ts", ".sb.cjs"]) */
    extensions?: string[];
    /** Whether to include external (node_modules) components (default: true) */
    includeExternal?: boolean;
    /** Maximum depth to scan (default: 20, prevents runaway scanning) */
    maxDepth?: number;
}

/**
 * Check if a path is within the project directory
 * Resolves symlinks and ensures we don't escape the project bounds
 */
async function isWithinProject(
    targetPath: string,
    projectRoot: string,
): Promise<boolean> {
    try {
        // Resolve both paths to handle symlinks
        const resolvedTarget = await realpath(targetPath);
        const resolvedRoot = await realpath(projectRoot);
        // Check if target is within project root
        return (
            resolvedTarget.startsWith(resolvedRoot + "/") ||
            resolvedTarget === resolvedRoot
        );
    } catch {
        // If we can't resolve the path, assume it's not safe
        return false;
    }
}

/**
 * Discover components in the working directory
 * Prefers .ts for local files and .cjs for external (node_modules) files
 * to avoid duplicates when both ESM and CJS versions exist
 *
 * Security: Stays within project bounds and doesn't follow symlinks outside
 */
export async function discoverComponents(
    workingDir: string,
    options?: DiscoverComponentsOptions,
): Promise<DiscoveredResource[]> {
    const components: DiscoveredResource[] = [];
    // Priority order: .ts first (local), then .cjs (for node_modules)
    // Skip .js and .mjs to avoid duplicates
    const extensions = options?.extensions ?? [".sb.ts", ".sb.cjs"];
    const includeExternal = options?.includeExternal ?? true;
    const maxDepth = options?.maxDepth ?? 20;

    // Resolve the project root for security checks
    const projectRoot = resolve(workingDir);

    const componentDirs = await readComponentDirectories(workingDir);

    const scanDir = async (
        dir: string,
        isExternal: boolean,
        depth: number,
    ): Promise<void> => {
        // Prevent excessive depth
        if (depth > maxDepth) {
            return;
        }

        // Security: Ensure we're still within project bounds
        if (!(await isWithinProject(dir, projectRoot))) {
            return;
        }

        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip common non-source directories
                    if (
                        entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist" ||
                        entry.name === ".cache" ||
                        entry.name === "coverage"
                    ) {
                        continue;
                    }
                    // Skip node_modules entirely if not including external
                    if (entry.name === "node_modules" && !includeExternal) {
                        continue;
                    }
                    const isNowExternal =
                        isExternal || entry.name === "node_modules";
                    await scanDir(fullPath, isNowExternal, depth + 1);
                } else if (entry.isFile()) {
                    // Skip external files if not including them
                    if (isExternal && !includeExternal) {
                        continue;
                    }
                    for (const ext of extensions) {
                        if (
                            entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")
                        ) {
                            const componentName = entry.name.replace(ext, "");
                            components.push({
                                name: componentName,
                                filePath: fullPath,
                                type: isExternal ? "external" : "local",
                            });
                            break;
                        }
                    }
                }
            }
        } catch {
            // Directory doesn't exist or can't be read
        }
    };

    for (const dir of componentDirs) {
        const fullDir = join(workingDir, dir);
        // Skip if the directory path includes node_modules and we're not including external
        if (dir.includes("node_modules") && !includeExternal) {
            continue;
        }
        try {
            const dirStat = await stat(fullDir);
            if (dirStat.isDirectory()) {
                await scanDir(fullDir, dir.includes("node_modules"), 0);
            }
        } catch {
            // Directory doesn't exist
        }
    }

    // Also scan root
    try {
        const rootEntries = await readdir(workingDir, { withFileTypes: true });
        for (const entry of rootEntries) {
            if (entry.isFile()) {
                for (const ext of extensions) {
                    if (
                        entry.name.endsWith(ext) &&
                        !entry.name.startsWith("_")
                    ) {
                        const componentName = entry.name.replace(ext, "");
                        if (!components.find((c) => c.name === componentName)) {
                            components.push({
                                name: componentName,
                                filePath: join(workingDir, entry.name),
                                type: "local",
                            });
                        }
                        break;
                    }
                }
            }
        }
    } catch {
        // Ignore
    }

    // Deduplicate: prefer .ts over .cjs for same component name
    const seen = new Map<string, DiscoveredResource>();
    for (const component of components) {
        const existing = seen.get(component.name);
        if (!existing) {
            seen.set(component.name, component);
        } else {
            // Prefer .ts files over .cjs
            if (
                component.filePath.endsWith(".ts") &&
                !existing.filePath.endsWith(".ts")
            ) {
                seen.set(component.name, component);
            }
            // Prefer local over external
            else if (
                component.type === "local" &&
                existing.type === "external"
            ) {
                seen.set(component.name, component);
            }
        }
    }

    const deduplicated = Array.from(seen.values());

    // Sort: local first, then by name
    deduplicated.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "local" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return deduplicated;
}

/**
 * Discover datasources in the working directory
 */
export async function discoverDatasources(
    workingDir: string,
): Promise<DiscoveredResource[]> {
    const datasources: DiscoveredResource[] = [];
    const extensions = [
        ".datasource.js",
        ".datasource.cjs",
        ".sb.datasource.js",
        ".sb.datasource.cjs",
    ];

    const scanDir = async (dir: string): Promise<void> => {
        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (
                        entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist" ||
                        entry.name === "node_modules"
                    ) {
                        continue;
                    }
                    await scanDir(fullPath);
                } else if (entry.isFile()) {
                    for (const ext of extensions) {
                        if (
                            entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")
                        ) {
                            const name = entry.name
                                .replace(ext, "")
                                .replace(".sb", "");
                            datasources.push({
                                name,
                                filePath: fullPath,
                                type: "local",
                            });
                            break;
                        }
                    }
                }
            }
        } catch {
            // Skip
        }
    };

    await scanDir(workingDir);
    datasources.sort((a, b) => a.name.localeCompare(b.name));
    return datasources;
}

/**
 * Discover roles in the working directory
 */
export async function discoverRoles(
    workingDir: string,
): Promise<DiscoveredResource[]> {
    const roles: DiscoveredResource[] = [];
    const extensions = [".sb.roles.js", ".sb.roles.cjs", ".sb.roles.ts"];

    const scanDir = async (dir: string): Promise<void> => {
        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (
                        entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist" ||
                        entry.name === "node_modules"
                    ) {
                        continue;
                    }
                    await scanDir(fullPath);
                } else if (entry.isFile()) {
                    for (const ext of extensions) {
                        if (
                            entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")
                        ) {
                            const name = entry.name.replace(ext, "");
                            roles.push({
                                name,
                                filePath: fullPath,
                                type: "local",
                            });
                            break;
                        }
                    }
                }
            }
        } catch {
            // Skip
        }
    };

    await scanDir(workingDir);
    roles.sort((a, b) => a.name.localeCompare(b.name));
    return roles;
}
