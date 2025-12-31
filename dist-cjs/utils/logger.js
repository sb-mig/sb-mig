"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
class Logger {
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
    static upload(content) {
        console.log(chalk_1.default.blue(`↑ ${content}`));
    }
    static download(content) {
        console.log(chalk_1.default.yellow(`↓ ${content}`));
    }
}
exports.default = Logger;
