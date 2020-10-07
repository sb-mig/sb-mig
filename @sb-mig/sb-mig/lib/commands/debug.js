"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("@oclif/command");
const core_1 = require("../core");
// TODO: implement --verbose flag to be available in every command
class Debug extends core_1.default {
    async run() {
        const { args, flags } = this.parse(Debug);
        const config = this.storyblokConfig();
        const componentsConfig = this.storyblokComponentsConfig().getAllData();
        console.log("storyblok.config.js: ", config, '\n');
        console.log("storyblok.components.lock.js: ", componentsConfig);
    }
}
exports.default = Debug;
Debug.description = 'Output extra debugging';
Debug.flags = {
    help: command_1.flags.help({ char: 'h' }),
};
Debug.args = [];
