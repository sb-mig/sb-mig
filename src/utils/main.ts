import { createRequire } from "module";

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
        .catch(() => {
            console.log("Cannot find requested file.");
        });
};

export const getFileContentWithRequire = (data: { file: string }) => {
    const require = createRequire(import.meta.url);
    return require(data.file);
};

export const getFilesContentWithRequire = (data: { files: string[] }) => {
    const require = createRequire(import.meta.url);
    return data.files.map((file) => require(file));
};
