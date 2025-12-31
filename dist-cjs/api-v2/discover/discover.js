"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverComponents = discoverComponents;
exports.discoverDatasources = discoverDatasources;
exports.discoverRoles = discoverRoles;
const promises_1 = require("fs/promises");
const path_1 = require("path");
/**
 * Read componentsDirectories from storyblok.config.js if it exists
 */
async function readComponentDirectories(workingDir) {
    const configFiles = [
        "storyblok.config.js",
        "storyblok.config.cjs",
        "storyblok.config.mjs",
    ];
    for (const configFile of configFiles) {
        try {
            const configPath = (0, path_1.join)(workingDir, configFile);
            const configContent = await (0, promises_1.readFile)(configPath, "utf-8");
            const match = configContent.match(/componentsDirectories\s*:\s*\[([\s\S]*?)\]/);
            if (match && match[1]) {
                const dirsMatch = match[1].match(/['"]([^'"]+)['"]/g);
                if (dirsMatch) {
                    return dirsMatch.map((d) => d.replace(/['"]/g, ""));
                }
            }
            break;
        }
        catch {
            // Config file doesn't exist, continue
        }
    }
    return ["src", "components", "storyblok"];
}
/**
 * Discover components in the working directory
 */
async function discoverComponents(workingDir, options) {
    const components = [];
    const extensions = options?.extensions ?? [
        ".sb.js",
        ".sb.cjs",
        ".sb.ts",
        ".sb.mjs",
    ];
    const componentDirs = await readComponentDirectories(workingDir);
    const scanDir = async (dir, isExternal) => {
        try {
            const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist") {
                        continue;
                    }
                    const isNowExternal = isExternal || entry.name === "node_modules";
                    await scanDir(fullPath, isNowExternal);
                }
                else if (entry.isFile()) {
                    for (const ext of extensions) {
                        if (entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")) {
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
        }
        catch {
            // Directory doesn't exist or can't be read
        }
    };
    for (const dir of componentDirs) {
        const fullDir = (0, path_1.join)(workingDir, dir);
        try {
            const dirStat = await (0, promises_1.stat)(fullDir);
            if (dirStat.isDirectory()) {
                await scanDir(fullDir, dir.includes("node_modules"));
            }
        }
        catch {
            // Directory doesn't exist
        }
    }
    // Also scan root
    try {
        const rootEntries = await (0, promises_1.readdir)(workingDir, { withFileTypes: true });
        for (const entry of rootEntries) {
            if (entry.isFile()) {
                for (const ext of extensions) {
                    if (entry.name.endsWith(ext) &&
                        !entry.name.startsWith("_")) {
                        const componentName = entry.name.replace(ext, "");
                        if (!components.find((c) => c.name === componentName)) {
                            components.push({
                                name: componentName,
                                filePath: (0, path_1.join)(workingDir, entry.name),
                                type: "local",
                            });
                        }
                        break;
                    }
                }
            }
        }
    }
    catch {
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
async function discoverDatasources(workingDir) {
    const datasources = [];
    const extensions = [
        ".datasource.js",
        ".datasource.cjs",
        ".sb.datasource.js",
        ".sb.datasource.cjs",
    ];
    const scanDir = async (dir) => {
        try {
            const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist" ||
                        entry.name === "node_modules") {
                        continue;
                    }
                    await scanDir(fullPath);
                }
                else if (entry.isFile()) {
                    for (const ext of extensions) {
                        if (entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")) {
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
        }
        catch {
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
async function discoverRoles(workingDir) {
    const roles = [];
    const extensions = [".sb.roles.js", ".sb.roles.cjs", ".sb.roles.ts"];
    const scanDir = async (dir) => {
        try {
            const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === ".git" ||
                        entry.name === ".next" ||
                        entry.name === "dist" ||
                        entry.name === "node_modules") {
                        continue;
                    }
                    await scanDir(fullPath);
                }
                else if (entry.isFile()) {
                    for (const ext of extensions) {
                        if (entry.name.endsWith(ext) &&
                            !entry.name.startsWith("_")) {
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
        }
        catch {
            // Skip
        }
    };
    await scanDir(workingDir);
    roles.sort((a, b) => a.name.localeCompare(b.name));
    return roles;
}
