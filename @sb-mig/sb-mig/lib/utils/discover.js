"use strict";
// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate
Object.defineProperty(exports, "__esModule", { value: true });
const glob = require("glob");
const path = require("path");
const config_1 = require("../config/config");
exports.findComponents = (componentDirectory) => {
    const directory = path.resolve(process.cwd(), componentDirectory);
    return (glob
        .sync(path.join(directory, `**`, `!(_*|*.datasource)*.js`))
        .map(file => require(path.resolve(directory, file))));
};
exports.findComponentsWithExt = (ext) => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    return (glob
        .sync(path.join(`${directory}/{${config_1.default.componentsDirectories.join(",")}}`, `**`, `[^_]*.${ext}`), {
        follow: true
    })
        .map(file => require(path.resolve(directory, file))));
};
exports.findComponentsByPackageName = (ext, specifiedComponents) => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    return (glob
        .sync(path.join(`${directory}/{${config_1.default.componentsDirectories.join(",")}}`, `**`, `package.json`), {
        follow: true
    })
        .filter(file => {
        return specifiedComponents.includes(require(path.resolve(directory, file)).name);
    })
        .map(file => {
        const fileFolderPath = file.split("/").slice(0, -1).join("/");
        return glob
            .sync(path.join(`${fileFolderPath}`, `**`, `[^_]*.${ext}`), {
            follow: true
        })
            .map(file => require(path.resolve(directory, file)).name);
    })
        .flat());
};
exports.findDatasources = () => {
    const rootDirectory = "./";
    const directory = path.resolve(process.cwd(), rootDirectory);
    return (glob
        .sync(path.join(`${directory}/${config_1.default.datasourcesDirectory}`, `**`, `[^_]*.datasource.js`))
        // eslint-disable-next-line global-require, import/no-dynamic-require
        .map(file => require(path.resolve(directory, file))));
};
