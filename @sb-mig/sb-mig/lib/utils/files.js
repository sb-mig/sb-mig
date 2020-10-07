"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const ncp_1 = require("ncp");
const path = require("path");
const logger_1 = require("./logger");
exports.getCurrentDirectoryBase = () => path.basename(process.cwd());
exports.isDirectoryExists = (path) => fs.existsSync(path);
exports.createDir = async (dirPath) => {
    await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
        recursive: true
    });
};
exports.createJsonFile = async (content, pathWithFilename) => {
    await fs.promises.writeFile(pathWithFilename, content, { flag: `w` });
};
exports.copyFolder = async (src, dest) => {
    return new Promise((resolve, reject) => {
        ncp_1.ncp(src, dest, function (err) {
            if (err) {
                reject({
                    failed: true,
                    message: `${src} copied unsuccessfully.`
                });
            }
            resolve({
                failed: false,
                message: `${src} copied successfully.`
            });
        });
    });
};
exports.copyFile = async (src, dest) => {
    const directory = dest.split("/").slice(0, dest.split("/").length - 1);
    const fileName = src.split("/")[src.split("/").length - 1];
    if (!exports.isDirectoryExists(directory.join("/"))) {
        await exports.createDir(directory.join("/"));
    }
    fs.copyFile(src, dest, err => {
        if (err) {
            logger_1.default.error(`There is no file to copy, named ${fileName}`);
            console.log(err);
            return false;
        }
        console.log(`${fileName} was copied to ${dest}`);
    });
};
