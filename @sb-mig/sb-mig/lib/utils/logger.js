"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const figlet = require("figlet");
class Logger {
    constructor(name) {
        this.name = name;
    }
    static bigLog(content) {
        console.log(chalk_1.default.yellow(figlet.textSync(content, { horizontalLayout: "full" })));
    }
    static log(content) {
        console.log(content);
    }
    static success(content) {
        console.log(chalk_1.default.green(`✓ ${content}`));
    }
    static warning(content) {
        console.log(chalk_1.default.yellow(`! ${content}`));
    }
    static error(content, { verbose } = { verbose: false }) {
        if (verbose) {
            console.log(content);
        }
        else {
            console.log(chalk_1.default.red(`✘ ${content}`));
        }
    }
}
exports.default = Logger;
