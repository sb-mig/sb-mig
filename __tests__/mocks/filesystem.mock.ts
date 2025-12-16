import { vi } from "vitest";

/**
 * Virtual file system for testing
 */
export class VirtualFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();

    constructor() {
        // Initialize with root
        this.directories.add("/");
    }

    /**
     * Add a file to the virtual file system
     */
    addFile(path: string, content: string): void {
        this.files.set(this.normalizePath(path), content);
        // Add parent directories
        const parts = path.split("/").filter(Boolean);
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
            current += "/" + parts[i];
            this.directories.add(current);
        }
    }

    /**
     * Add a directory to the virtual file system
     */
    addDirectory(path: string): void {
        this.directories.add(this.normalizePath(path));
    }

    /**
     * Check if a file exists
     */
    fileExists(path: string): boolean {
        return this.files.has(this.normalizePath(path));
    }

    /**
     * Check if a directory exists
     */
    directoryExists(path: string): boolean {
        return this.directories.has(this.normalizePath(path));
    }

    /**
     * Get file content
     */
    readFile(path: string): string | undefined {
        return this.files.get(this.normalizePath(path));
    }

    /**
     * List files in a directory
     */
    listDirectory(path: string): string[] {
        const normalizedPath = this.normalizePath(path);
        const results: string[] = [];

        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(normalizedPath + "/")) {
                const relativePath = filePath.slice(normalizedPath.length + 1);
                const firstPart = relativePath.split("/")[0];
                if (firstPart && !results.includes(firstPart)) {
                    results.push(firstPart);
                }
            }
        }

        for (const dirPath of this.directories) {
            if (
                dirPath.startsWith(normalizedPath + "/") &&
                dirPath !== normalizedPath
            ) {
                const relativePath = dirPath.slice(normalizedPath.length + 1);
                const firstPart = relativePath.split("/")[0];
                if (firstPart && !results.includes(firstPart)) {
                    results.push(firstPart);
                }
            }
        }

        return results;
    }

    /**
     * Clear all files and directories
     */
    clear(): void {
        this.files.clear();
        this.directories.clear();
        this.directories.add("/");
    }

    private normalizePath(path: string): string {
        // Remove trailing slash and normalize
        return path.replace(/\/+$/, "").replace(/\/+/g, "/");
    }
}

/**
 * Create mock fs functions based on virtual file system
 */
export function createMockFs(vfs: VirtualFileSystem) {
    return {
        existsSync: vi.fn((path: string) => {
            return vfs.fileExists(path) || vfs.directoryExists(path);
        }),
        readFileSync: vi.fn((path: string) => {
            const content = vfs.readFile(path);
            if (content === undefined) {
                throw new Error(`ENOENT: no such file or directory, open '${path}'`);
            }
            return content;
        }),
        writeFileSync: vi.fn((path: string, content: string) => {
            vfs.addFile(path, content);
        }),
        promises: {
            readFile: vi.fn(async (path: string) => {
                const content = vfs.readFile(path);
                if (content === undefined) {
                    throw new Error(
                        `ENOENT: no such file or directory, open '${path}'`
                    );
                }
                return content;
            }),
            writeFile: vi.fn(async (path: string, content: string) => {
                vfs.addFile(path, content);
            }),
            mkdir: vi.fn(async (path: string) => {
                vfs.addDirectory(path);
            }),
            readdir: vi.fn(async (path: string) => {
                return vfs.listDirectory(path);
            }),
            stat: vi.fn(async (path: string) => {
                const isFile = vfs.fileExists(path);
                const isDir = vfs.directoryExists(path);
                if (!isFile && !isDir) {
                    throw new Error(
                        `ENOENT: no such file or directory, stat '${path}'`
                    );
                }
                return {
                    isFile: () => isFile,
                    isDirectory: () => isDir,
                };
            }),
        },
    };
}

/**
 * Create a component schema file content for testing
 */
export function createComponentSchemaContent(
    name: string,
    options: {
        displayName?: string;
        isRoot?: boolean;
        isNestable?: boolean;
        groupName?: string;
        schema?: Record<string, unknown>;
    } = {}
): string {
    const {
        displayName = name.charAt(0).toUpperCase() + name.slice(1),
        isRoot = false,
        isNestable = true,
        groupName,
        schema = { title: { type: "text" } },
    } = options;

    return `export default {
    name: "${name}",
    display_name: "${displayName}",
    is_root: ${isRoot},
    is_nestable: ${isNestable},
    ${groupName ? `component_group_name: "${groupName}",` : ""}
    schema: ${JSON.stringify(schema, null, 4)}
};`;
}

/**
 * Create a datasource file content for testing
 */
export function createDatasourceContent(
    name: string,
    entries: Array<{ name: string; value: string }>
): string {
    return `export default {
    name: "${name}",
    slug: "${name.toLowerCase().replace(/\s+/g, "-")}",
    datasource_entries: ${JSON.stringify(
        entries.map((e) => ({
            componentName: e.name,
            importPath: e.value,
        })),
        null,
        4
    )}
};`;
}

/**
 * Create a roles file content for testing
 */
export function createRolesContent(
    role: string,
    permissions: string[] = []
): string {
    return `export default {
    role: "${role}",
    permissions: ${JSON.stringify(permissions)}
};`;
}
