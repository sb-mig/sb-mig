"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const dotenv = require("dotenv");
const fs_1 = require("fs");
dotenv.config();
class StoryblokComponentsConfig {
    constructor(data) {
        this.storyblokComponentsConfigUrl = path.resolve(process.cwd(), 'storyblok.components.lock.js');
        this.data = data;
    }
    writeComponentsConfigFile(data) {
        const content = `module.exports = ${JSON.stringify(data)}`;
        fs_1.promises.writeFile(this.storyblokComponentsConfigUrl, content, { encoding: 'utf-8' })
            .then((result) => {
            console.log("so what is that ?");
            console.log(result);
            return result;
        })
            .catch((err) => {
            console.log("error, wtf ?");
            console.log(err.message);
        });
        return true;
    }
    updateComponentsConfigFile() {
        const content = `module.exports = ${JSON.stringify(this.data)}`;
        fs_1.promises.writeFile(this.storyblokComponentsConfigUrl, content, { encoding: 'utf-8' })
            .then((result) => {
            console.log("so what is that ?");
            console.log(result);
            return true;
        })
            .catch((err) => {
            console.log("error, wtf ?");
            console.log(err.message);
            return false;
        });
        return true;
    }
    addComponentsToComponentsConfigFile(installedComponents, local) {
        return {
            ...this.data,
            ...installedComponents.reduce((prev, curr) => {
                if (!this.getSingleData(`${curr.scope}/${curr.name}`)) {
                    return {
                        ...prev,
                        [`${curr.scope}/${curr.name}`]: {
                            name: `${curr.scope}/${curr.name}`,
                            scope: curr.scope,
                            location: local ? "local" : "node_modules",
                            version: "?",
                            modified: false,
                            isLinkedInComponentFile: false
                        }
                    };
                }
            }, {})
        };
    }
    getAllData() {
        return this.data;
    }
    getSingleData(componentName) {
        return this.data[componentName];
    }
    setAllData(data) {
        this.data = {
            ...this.data,
            ...data
        };
    }
    setSingleData(singleComponentData) {
        this.data[singleComponentData.name] = singleComponentData;
    }
}
exports.StoryblokComponentsConfig = StoryblokComponentsConfig;
let fileContent;
try {
    fileContent = require(path.resolve(process.cwd(), 'storyblok.components.lock.js'));
}
catch (err) {
    fileContent = {};
}
exports.default = new StoryblokComponentsConfig(fileContent);
