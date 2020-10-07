"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("@oclif/command");
const core_1 = require("../core");
const config_1 = require("../config/config");
const components_1 = require("../api/components");
const datasources_1 = require("../api/datasources");
const componentPresets_1 = require("../api/componentPresets");
const presets_1 = require("../api/presets");
const logger_1 = require("../utils/logger");
const files_1 = require("../utils/files");
class Backup extends core_1.default {
    // static strict = false;
    async run() {
        const { args, flags, argv } = this.parse(Backup);
        // Backup all components as json file
        if (flags.allComponents) {
            return components_1.getAllComponents()
                .then(async (res) => {
                const randomDatestamp = new Date().toJSON();
                const filename = `all-components-${randomDatestamp}`;
                await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/components/`);
                await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/components/${filename}.json`);
                logger_1.default.success(`All components written to a file:  ${filename}`);
                return true;
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        // Backup one component as json file
        if (flags.oneComponent) {
            return components_1.getComponent(flags.oneComponent).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `component-${flags.oneComponent}-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/components/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/components/${filename}.json`);
                    logger_1.default.success(`Component for ${flags.oneComponent} written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.allComponentsGroups) {
            return components_1.getAllComponentsGroups().then(async (res) => {
                const randomDatestamp = new Date().toJSON();
                const filename = `all-component_groups-${randomDatestamp}`;
                await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/component_groups/`);
                await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/component_groups/${filename}.json`);
                logger_1.default.success(`All groups written to a file:  ${filename}`);
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.oneComponentsGroup) {
            return components_1.getComponentsGroup(flags.oneComponentsGroup).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `components_group-${flags.oneComponentsGroup}-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/component_groups/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/component_groups/${filename}.json`);
                    logger_1.default.success(`Components group for ${flags.oneComponentsGroup} written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.allDatasources) {
            return datasources_1.getAllDatasources().then(async (res) => {
                const randomDatestamp = new Date().toJSON();
                const filename = `all-datasources-${randomDatestamp}`;
                await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/datasources/`);
                await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/datasources/${filename}.json`);
                logger_1.default.success(`All datasources written to a file:  ${filename}`);
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.oneDatasource) {
            return datasources_1.getDatasource(flags.oneDatasource).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `datasource-${flags.oneDatasource}-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/datasources/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/datasources/${filename}.json`);
                    logger_1.default.success(`Datasource for ${flags.oneDatasource} written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.datasourceEntries) {
            return datasources_1.getDatasourceEntries(flags.datasourceEntries).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `datasource-entries-${flags.datasourceEntries}-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/datasources/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/datasources/${filename}.json`);
                    logger_1.default.success(`Datasource entries for ${flags.datasourceEntries} written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.oneComponentPresets) {
            return componentPresets_1.getComponentPresets(flags.oneComponentPresets).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `component-${flags.oneComponentPresets}-all_presets-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/component-presets/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/component-presets/${filename}.json`);
                    logger_1.default.success(`Presets for ${flags.oneComponentPresets} written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.allPresets) {
            return presets_1.getAllPresets().then(async (res) => {
                const randomDatestamp = new Date().toJSON();
                const filename = `all-presets-${randomDatestamp}`;
                await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/presets/`);
                await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/presets/${filename}.json`);
                logger_1.default.success(`All presets written to a file:  ${filename}`);
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        if (flags.onePreset) {
            return presets_1.getPreset(flags.onePreset).then(async (res) => {
                if (res) {
                    const randomDatestamp = new Date().toJSON();
                    const filename = `preset-${flags.onePreset}-${randomDatestamp}`;
                    await files_1.createDir(`${config_1.default.sbmigWorkingDirectory}/presets/`);
                    await files_1.createJsonFile(JSON.stringify(res), `${config_1.default.sbmigWorkingDirectory}/presets/${filename}.json`);
                    logger_1.default.success(`Preset for '${flags.onePreset}' have been written to a file:  ${filename}`);
                }
            })
                .catch((err) => {
                console.log(err);
                this.error("error happened... :(");
            });
        }
        this.exit();
    }
}
exports.default = Backup;
Backup.description = "Command for backing up anything related to Storyblok";
Backup.flags = {
    help: command_1.flags.help({ char: "h" }),
    allComponents: command_1.flags.boolean({ char: "a", description: "Backup all components." }),
    oneComponent: command_1.flags.string({ char: "o", description: "Backup one component by name." }),
    allComponentsGroups: command_1.flags.boolean({ char: "g", description: "Backup all components groups." }),
    oneComponentsGroup: command_1.flags.string({ char: 'f', description: "Backup one components group by name." }),
    oneComponentPresets: command_1.flags.string({ char: 'p', description: "Backup all presets for one component" }),
    allPresets: command_1.flags.boolean({ char: 'l', description: "Backup all presets." }),
    onePreset: command_1.flags.string({ char: 'i', description: "Backup one preset by id." }),
    allDatasources: command_1.flags.boolean({ char: 'd', description: "Backup all datasources." }),
    oneDatasource: command_1.flags.string({ char: 'x', description: "Backup one datasource by name." }),
    datasourceEntries: command_1.flags.string({ char: 'e', description: "Backup one datasource entries by datasource name." })
};
Backup.args = [];
