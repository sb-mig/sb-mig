import type { RequestBaseConfig } from "../api/utils/request.js";

import * as fs from "fs";
import { writeFile } from "fs";
import { createRequire } from "module";
import path from "path";

import pkg from "ncp";

import { generateDatestamp } from "./date-utils.js";
import Logger from "./logger.js";

const { ncp } = pkg;

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
    return import(data.file)
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
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson;
};

export const isDirectoryExists = (path: string) => fs.existsSync(path);

export const createDir = async (dirPath: string) => {
    await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
        recursive: true,
    });
};

export const createJsonFile = async (
    content: string,
    pathWithFilename: string,
) => {
    await fs.promises.writeFile(pathWithFilename, content, { flag: "w" });
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
    const directory = dest.split("/").slice(0, dest.split("/").length - 1);
    const fileName = src.split("/")[src.split("/").length - 1];

    if (!isDirectoryExists(directory.join("/"))) {
        await createDir(directory.join("/"));
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
        if (ext === "json") {
            await createJsonFile(JSON.stringify(res, undefined, 2), fullPath);
        } else {
            await createJsonFile(JSON.stringify(res, undefined, 2), fullPath);
        }

        Logger.success(`All response written to a file:  ${fullPath}`);
    }

    if (path) {
        const folderPath = path
            .split("/")
            .slice(0, path.split("/").length - 1)
            .join("/");
        await createDir(folderPath);
        await createJsonFile(JSON.stringify(res, undefined, 2), path);

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

export const readFile = async (pathToFile: string) => {
    const absolutePath = path.join(process.cwd(), pathToFile);

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
        file: path.join(process.cwd(), "package.json"),
    });
    return consumerPkg;
};

export const getSbMigPackageJson = async () => {
    const sbMigPkg = await getFileContentWithRequire({
        file: path.join("..", "..", "package.json"),
    });
    return sbMigPkg;
};
