import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
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
 * Discover components in the working directory
 */
export async function discoverComponents(
    workingDir: string,
    options?: { extensions?: string[] },
): Promise<DiscoveredResource[]> {
    const components: DiscoveredResource[] = [];
    const extensions = options?.extensions ?? [
        ".sb.js",
        ".sb.cjs",
        ".sb.ts",
        ".sb.mjs",
    ];

    const componentDirs = await readComponentDirectories(workingDir);

    const scanDir = async (dir: string, isExternal: boolean): Promise<void> => {
        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (
                        entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist"
                    ) {
                        continue;
                    }
                    const isNowExternal =
                        isExternal || entry.name === "node_modules";
                    await scanDir(fullPath, isNowExternal);
                } else if (entry.isFile()) {
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
        try {
            const dirStat = await stat(fullDir);
            if (dirStat.isDirectory()) {
                await scanDir(fullDir, dir.includes("node_modules"));
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

    // Sort: local first, then by name
    components.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "local" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return components;
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
