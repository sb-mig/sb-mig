import * as fs from "fs";
import pkg from "ncp";
import { generateDatestamp } from "./others.js";
import storyblokConfig from "../config/config.js";
import Logger from "./logger.js";

const { ncp } = pkg;

export const isDirectoryExists = (path: string) => fs.existsSync(path);

export const createDir = async (dirPath: string) => {
    await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
        recursive: true,
    });
};

export const createJsonFile = async (
    content: string,
    pathWithFilename: string
) => {
    await fs.promises.writeFile(pathWithFilename, content, { flag: "w" });
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

interface CreateAndSaveToFile {
    prefix: string;
    folder: string;
    res: any;
}

export const createAndSaveToFile = async ({
    prefix,
    folder,
    res,
}: CreateAndSaveToFile): Promise<void> => {
    const datestamp = new Date();
    const filename = `${prefix}${generateDatestamp(datestamp)}`;
    await createDir(`${storyblokConfig.sbmigWorkingDirectory}/${folder}/`);
    await createJsonFile(
        JSON.stringify(res, undefined, 2),
        `${storyblokConfig.sbmigWorkingDirectory}/${folder}/${filename}.json`
    );
    Logger.success(`All groups written to a file:  ${filename}`);
};
