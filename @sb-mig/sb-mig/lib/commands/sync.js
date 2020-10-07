"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("@oclif/command");
const core_1 = require("../core");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
const migrate_1 = require("../api/migrate");
class Sync extends core_1.default {
    async run() {
        const { argv, args, flags } = this.parse(Sync);
        const components = argv.splice(1, argv.length);
        if (args.type === "components" && flags.all && flags.ext) {
            logger_1.default.log(`Syncing all components with ${config_1.default.schemaFileExt} extension...`);
            migrate_1.syncAllComponents(config_1.default.schemaFileExt, !!flags.presets);
        }
        if (args.type === "components" && flags.all && !flags.ext) {
            logger_1.default.log(`Syncing all components from ${config_1.default.componentDirectory} directory...`);
            migrate_1.syncAllComponents(!!flags.ext, !!flags.presets);
        }
        if (args.type === "components" && !flags.all && flags.ext) {
            logger_1.default.log(`Syncing provided components with ${config_1.default.schemaFileExt} extension, inside [${config_1.default.componentsDirectories.join(", ")}] directories ...`);
            if (components.length === 0) {
                logger_1.default.warning(`You have to provide some components separated with empty space. For exmaple: 'row column card'`);
            }
            else {
                migrate_1.syncComponents(components, config_1.default.schemaFileExt, !!flags.presets, flags.packageName);
            }
        }
        if (args.type === "components" && !flags.all && !flags.ext) {
            logger_1.default.log("Syncing provided components...");
            if (components.length === 0) {
                logger_1.default.warning(`You have to provide some components separated with empty space. For exmaple: 'row column card'`);
            }
            else {
                migrate_1.syncComponents(components, !!flags.ext, !!flags.presets, flags.packageName);
            }
        }
        if (args.type === "datasources") {
            // TODO: implement syncing datasources
            this.error("There is no implementation for synchronizing datasources, yet.");
        }
    }
}
exports.default = Sync;
Sync.description = 'Synchronize components, datasources with Storyblok space.';
Sync.flags = {
    help: command_1.flags.help({ char: 'h' }),
    all: command_1.flags.boolean({ char: 'a', description: "Synchronize all components." }),
    ext: command_1.flags.boolean({ char: 'e', description: "Synchronize with file extension. Default extension: '.sb.js'" }),
    packageName: command_1.flags.boolean({ char: 'n', description: "Synchronize based on installed package name." }),
    presets: command_1.flags.boolean({ char: 'p', description: "Synchronize components with presets." }),
};
Sync.strict = false;
Sync.args = [
    { name: 'type', description: "What to synchronize", options: ['components', 'datasources'], required: true },
    { name: "list", description: "Space separated list of component names. Example: card product-card row layout" }
];
