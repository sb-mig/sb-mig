import fs from "fs";
import { createRequire } from "module";
import path from "path";

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
    return data.files.map((file) => {
        const requiredFile = require(file);

        if ("default" in requiredFile) {
            return requiredFile.default;
        } else {
            return requiredFile;
        }
    });
};

export const isObjectEmpty = (obj: any) => {
    if (obj) {
        return Object.keys(obj).length === 0 && obj.constructor === Object;
    } else {
        return true;
    }
};

export const delay = (time: number) =>
    new Promise((resolve) => setTimeout(resolve, time));

export const isItFactory = <T>(flags: any, rules: any, whitelist: string[]) => {
    return (type: T) => {
        const rulesCopy = [...rules[type]];
        const flagsKeys = Object.keys(flags);

        const temp = flagsKeys.map((flag: string) => {
            if (whitelist.includes(flag)) {
                return true;
            }
            if (rulesCopy.includes(flag)) {
                rulesCopy.splice(rulesCopy.indexOf(flag), 1);
                return true;
            } else {
                return false;
            }
        });

        if (rulesCopy.length > 0) {
            return false;
        } else {
            return temp.every((el: boolean) => el === true);
        }
    };
};

export const getPackageJson = () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");

    // Read the file content as a string
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");

    // Parse the file content as a JSON object
    const packageJson = JSON.parse(packageJsonContent);

    return packageJson;
};

export const extractFields = (data: any, filter: any) => {
    const result: any = {};

    for (const key in filter) {
        if (filter[key] === true) {
            result[key] = data[key];
        } else if (typeof filter[key] === "object") {
            result[key] = extractFields(data[key], filter[key]);
        }
    }

    return result;
};

// export const generateMetadata = (args: any) => {
//     const packageJson = getPackageJson();
//
//     const contentHubName = packageJson.name;
//     const contentHubLatestVersion = packageJson.version;
//
//     const backpackVersionInContentHub =
//         packageJson.dependencies['@ef-global/backpack'];
//
//     return {
//         metadata: {
//             contentHubName,
//             contentHubLatestVersion,
//             backpackVersionInContentHub,
//         },
//     };
// };
