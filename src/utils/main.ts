import { createRequire } from "module";
import fs from "fs";

export const prop = (k: any) => (o: any) => o[k];

export const pipe =
    (...fns: any[]) =>
    (x: any) =>
        [...fns].reduce((acc, f) => f(acc), x);

export const unpackElements = (input: string[]) => {
    const [_1, _2, ...elementsForUse] = input;
    return elementsForUse;
};

export const unpackOne = (input: string[]) => {
    const [_1, _2, elementForUse] = input;
    return elementForUse;
};

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

export const getFileContentWithRequire = (data: { file: string }) => {
    const require = createRequire(import.meta.url);
    const fileContent = require(data.file);

    if (fileContent.default) {
        return fileContent.default;
    }

    return fileContent;
};

export const getFilesContentWithRequire = (data: { files: string[] }) => {
    const require = createRequire(import.meta.url);
    return data.files.map((file) => require(file));
};

export const isObjectEmpty = (obj: any) => {
    if (obj) {
        return Object.keys(obj).length === 0;
    } else {
        return true;
    }
};
