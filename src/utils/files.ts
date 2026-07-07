import type { RequestBaseConfig } from "../api/utils/request.js";

import * as fs from "fs";
import { writeFile } from "fs";
import { createRequire } from "module";
import nodePath from "path";
import { pathToFileURL } from "url";

import pkg from "ncp";

import { generateDatestamp } from "./date-utils.js";
import Logger from "./logger.js";

const { ncp } = pkg;

const resolveFromCwd = (
    filePath: string,
    pathApi: typeof nodePath = nodePath,
): string =>
    pathApi.isAbsolute(filePath)
        ? filePath
        : pathApi.resolve(process.cwd(), filePath);

export const toImportSpecifier = (
    filePath: string,
    platform: NodeJS.Platform = process.platform,
): string => {
    if (/^(file|data|node):/.test(filePath)) {
        return filePath;
    }

    const pathApi = platform === "win32" ? nodePath.win32 : nodePath;
    const resolvedPath = resolveFromCwd(filePath, pathApi);

    return platform === "win32"
        ? pathToFileURL(resolvedPath, { windows: true }).href
        : resolvedPath;
};

// ============================================================================
// File Content Loading
// ============================================================================

/**
 * Asynchronously load a file using dynamic import
 * Returns the default export of the module
 *
 * @param data - Object containing the file path
 * @returns The default export of the imported module
 */
export const getFileContent = (data: { file: string }): any => {
    return import(/* @vite-ignore */ toImportSpecifier(data.file))
        .then((res) => {
            return res.default;
        })
        .catch((err) => {
            console.log(err);
            console.log("Cannot find requested file.");
        });
};

/**
 * Synchronously load a file using require
 * Handles both CommonJS and ES modules with default exports
 *
 * @param data - Object containing the file path
 * @returns The file content (default export if available)
 */
export const getFileContentWithRequire = (data: { file: string }) => {
    const require = createRequire(import.meta.url);
    const fileContent = require(data.file);

    if (fileContent.default) {
        return fileContent.default;
    }

    return fileContent;
};

/**
 * Load multiple files using require
 *
 * @param data - Object containing array of file paths
 * @returns Array of file contents
 */
export const getFilesContentWithRequire = (data: { files: string[] }) => {
    return data.files.map((file) => getFileContentWithRequire({ file }));
};

/**
 * Read and parse the package.json from current working directory
 *
 * @returns Parsed package.json object
 */
export const getPackageJson = () => {
    const packageJsonPath = nodePath.join(process.cwd(), "package.json");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson;
};

export const isDirectoryExists = (path: string) => fs.existsSync(path);

export const createDir = async (dirPath: string) => {
    await fs.promises.mkdir(resolveFromCwd(dirPath), {
        recursive: true,
    });
};

export const createJsonFile = async (
    content: string,
    pathWithFilename: string,
) => {
    await fs.promises.writeFile(pathWithFilename, content, { flag: "w" });
};

/*
 * Streams an array to disk as a pretty-printed (2-space) JSON array,
 * one element at a time. Avoids building the whole document as a single
 * string, which overflows V8's max string length (~512 MB) for large
 * migration sets. Output is byte-for-byte identical to
 * JSON.stringify(items, null, 2).
 * */
export const writeJsonArrayStreamed = (
    items: any[],
    pathWithFilename: string,
): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        const stream = fs.createWriteStream(pathWithFilename, { flags: "w" });
        let settled = false;

        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            reject(err);
        };

        stream.on("error", fail);
        stream.on("finish", () => {
            if (settled) return;
            settled = true;
            resolve();
        });

        const indentElement = (item: any): string => {
            const serialized = JSON.stringify(item, null, 2);
            const body = serialized === undefined ? "null" : serialized;
            return `  ${body.replace(/\n/g, "\n  ")}`;
        };

        const writeChunk = (chunk: string): Promise<void> =>
            new Promise<void>((res, rej) => {
                const onErr = (err: Error) => rej(err);
                const ok = stream.write(chunk, (err) => {
                    if (err) {
                        rej(err);
                        return;
                    }
                    if (ok) {
                        stream.removeListener("error", onErr);
                        res();
                    }
                });
                if (!ok) {
                    stream.once("drain", () => {
                        stream.removeListener("error", onErr);
                        res();
                    });
                }
                stream.once("error", onErr);
            });

        const writeChunks = async () => {
            if (items.length === 0) {
                stream.write("[]");
                return;
            }

            await writeChunk("[\n");
            for (let i = 0; i < items.length; i++) {
                const prefix = i === 0 ? "" : ",\n";
                await writeChunk(`${prefix}${indentElement(items[i])}`);
            }
            await writeChunk("\n]");
        };

        writeChunks()
            .then(() => stream.end())
            .catch((err) => {
                stream.destroy();
                fail(err as Error);
            });
    });
};

/*
 * Streams a top-level JSON array from disk, parsing one element at a time.
 * The counterpart to writeJsonArrayStreamed: large migration artifacts are
 * written without ever building the whole document as a single string, so they
 * must also be READ without `fs.readFile(...).toString()`, which throws
 * ERR_STRING_TOO_LONG once the file passes V8's ~512 MB max string length.
 *
 * Only the array document is streamed; each individual element is parsed with
 * JSON.parse (elements are small). Throws if the file is not a JSON array.
 */
export const readJsonArrayStreamed = (pathToFile: string): Promise<any[]> => {
    return new Promise<any[]>((resolve, reject) => {
        const stream = fs.createReadStream(resolveFromCwd(pathToFile), {
            encoding: "utf8",
        });

        const items: any[] = [];
        let started = false; // seen the opening `[`
        let done = false; // seen the matching top-level `]`
        let buffer = ""; // current element text
        let depth = 0; // nesting depth inside the current element
        let inString = false;
        let escaped = false;
        let settled = false;

        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            stream.destroy();
            reject(err);
        };

        const flushElement = () => {
            const text = buffer.trim();
            buffer = "";
            if (text.length === 0) {
                return;
            }
            items.push(JSON.parse(text));
        };

        stream.on("data", (rawChunk: string | Buffer) => {
            if (done) return;

            // The stream is opened with utf8 encoding, so chunks arrive as
            // strings (decoded across multi-byte boundaries). The Buffer arm is
            // only here to satisfy the Node type signature.
            const chunk =
                typeof rawChunk === "string"
                    ? rawChunk
                    : rawChunk.toString("utf8");

            for (let i = 0; i < chunk.length; i++) {
                const ch = chunk[i]!;

                if (!started) {
                    if (ch === "[") {
                        started = true;
                    } else if (ch.trim() !== "") {
                        fail(
                            new Error(
                                `Expected a JSON array in ${pathToFile}, found "${ch}".`,
                            ),
                        );
                        return;
                    }
                    continue;
                }

                if (inString) {
                    buffer += ch;
                    if (escaped) {
                        escaped = false;
                    } else if (ch === "\\") {
                        escaped = true;
                    } else if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    buffer += ch;
                    continue;
                }

                if (ch === "{" || ch === "[") {
                    depth++;
                    buffer += ch;
                    continue;
                }

                if (ch === "}") {
                    depth--;
                    buffer += ch;
                    continue;
                }

                if (ch === "]") {
                    if (depth === 0) {
                        // closing the top-level array
                        try {
                            flushElement();
                        } catch (error) {
                            fail(error as Error);
                            return;
                        }
                        done = true;
                        break;
                    }
                    depth--;
                    buffer += ch;
                    continue;
                }

                if (ch === "," && depth === 0) {
                    try {
                        flushElement();
                    } catch (error) {
                        fail(error as Error);
                        return;
                    }
                    continue;
                }

                buffer += ch;
            }
        });

        stream.on("error", fail);
        stream.on("end", () => {
            if (settled) return;
            if (!started) {
                fail(new Error(`Empty or non-JSON file: ${pathToFile}`));
                return;
            }
            settled = true;
            resolve(items);
        });
    });
};

export const createJSAllComponentsFile = async (
    content: string,
    pathWithFilename: string,
    timestamp = false,
) => {
    const datestamp = new Date();
    const finalContent = `/*

Auto-generated file by sb-mig discovery
${timestamp ? `Generated on: ${generateDatestamp(datestamp)}` : ""}

Do not edit manually (use yarn components:discover instead)

*/
export const componentList = ${content} as const;

export type Components = typeof componentList[number];
`;

    await fs.promises.writeFile(pathWithFilename, finalContent, { flag: "w" });
};

export const copyFolder = async (src: string, dest: string) => {
    return new Promise((resolve, reject) => {
        ncp(src, dest, function (err) {
            if (err) {
                reject({
                    failed: true,
                    message: `${src} copied unsuccessfully.`,
                });
            }
            resolve({
                failed: false,
                message: `${src} copied successfully.`,
            });
        });
    });
};

export const copyFile = async (src: string, dest: string) => {
    const directory = nodePath.dirname(dest);
    const fileName = nodePath.basename(src);

    if (!isDirectoryExists(directory)) {
        await createDir(directory);
    }

    fs.copyFile(src, dest, (err) => {
        if (err) {
            console.error(`There is no file to copy, named ${fileName}`);
            console.log(err);
            return false;
        }

        console.log(`${fileName} was copied to ${dest}`);
        return true;
    });
};

// interface CreateAndSaveToFile {
//     prefix: string;
//     folder: string;
//     res: any;
// }

interface CreateAndSavePresetToFile {
    filename: string;
    res: any;
}

type CreateAndSaveComponentListToFile = (
    args: {
        file?: string;
        folder?: string;
        res: any;
        timestamp?: boolean;
    },
    config: RequestBaseConfig,
) => Promise<void>;

type CreateAndSaveToFile = (
    args: {
        ext?: string;
        datestamp?: boolean;
        prefix?: string;
        suffix?: string;
        path?: string;
        filename?: string;
        folder?: string;
        res: any;
    },
    config: RequestBaseConfig,
) => void;

/*
 *
 * General function to create and save to file
 * the most used one for many different purposes
 *
 * */
export const createAndSaveToFile: CreateAndSaveToFile = async (
    args,
    config,
) => {
    const { sbmigWorkingDirectory } = config;
    const {
        ext = "json",
        datestamp = false,
        prefix = "",
        suffix = "",
        path = null,
        filename = "",
        folder = "default",
        res,
    } = args;
    if (!path) {
        const timestamp = generateDatestamp(new Date());
        const finalFilename = `${prefix}${filename}${
            datestamp ? `__${timestamp}` : ""
        }`;
        const fullPath = `${sbmigWorkingDirectory}/${folder}/${finalFilename}${suffix}.${ext}`;

        await createDir(`${sbmigWorkingDirectory}/${folder}/`);
        if (Array.isArray(res)) {
            await writeJsonArrayStreamed(res, fullPath);
        } else {
            await createJsonFile(JSON.stringify(res, undefined, 2), fullPath);
        }

        Logger.success(`All response written to a file:  ${fullPath}`);
    }

    if (path) {
        const folderPath = nodePath.dirname(path);
        await createDir(folderPath);
        if (Array.isArray(res)) {
            await writeJsonArrayStreamed(res, path);
        } else {
            await createJsonFile(JSON.stringify(res, undefined, 2), path);
        }

        Logger.success(`All response written to a file:  ${path}`);
    }
};

/*
 *
 * Specific function for saving component list to file
 * ef backpack related
 *
 * */
export const createAndSaveComponentListToFile: CreateAndSaveComponentListToFile =
    async ({ file, folder, res, timestamp = false }, config) => {
        const { sbmigWorkingDirectory } = config;
        const datestamp = new Date();
        const filename =
            file ?? `all-components__${generateDatestamp(datestamp)}`;
        await createDir(
            folder
                ? `${sbmigWorkingDirectory}/${folder}/`
                : `${sbmigWorkingDirectory}/`,
        );
        await createJSAllComponentsFile(
            JSON.stringify(res, null, 2),
            folder
                ? `${sbmigWorkingDirectory}/${folder}/${filename}.ts`
                : `${sbmigWorkingDirectory}/${filename}.ts`,
            timestamp,
        );
        Logger.success(`All components written to a file:  ${filename}`);
    };

export const listFilesInDir = async (dirPath: string): Promise<string[]> => {
    const absolutePath = resolveFromCwd(dirPath);

    try {
        return await fs.promises.readdir(absolutePath);
    } catch {
        return [];
    }
};

export const readFile = async (pathToFile: string) => {
    const absolutePath = resolveFromCwd(pathToFile);

    try {
        const result = await fs.promises.readFile(absolutePath);
        return result.toString();
    } catch (e) {
        console.log(e);
        console.error("Error happened while reading file.");
        return;
    }
};

export const dumpToFile = async (path: string, content: string) => {
    writeFile(path, content, (err) => {
        if (err) {
            console.error("Error writing to file:", err);
        } else {
            console.log("Successfully wrote to file");
        }
    });
};

export const getConsumerPackageJson = async () => {
    const consumerPkg = await getFileContentWithRequire({
        file: nodePath.join(process.cwd(), "package.json"),
    });
    return consumerPkg;
};

export const getSbMigPackageJson = async () => {
    const sbMigPkg = await getFileContentWithRequire({
        file: nodePath.join("..", "..", "package.json"),
    });
    return sbMigPkg;
};
