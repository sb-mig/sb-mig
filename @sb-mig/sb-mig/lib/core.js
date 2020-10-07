"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("@oclif/command");
const config_1 = require("./config/config");
const StoryblokComponentsConfig_1 = require("./config/StoryblokComponentsConfig");
const files_1 = require("./utils/files");
const discover_1 = require("./utils/discover");
const components_1 = require("./api/components");
const datasources_1 = require("./api/datasources");
const componentPresets_1 = require("./api/componentPresets");
const presets_1 = require("./api/presets");
const migrate_1 = require("./api/migrate");
const mutateComponents_1 = require("./api/mutateComponents");
const spaces_1 = require("./api/spaces");
class default_1 extends command_1.default {
    storyblokConfig() {
        return config_1.default;
    }
    storyblokComponentsConfig() {
        return StoryblokComponentsConfig_1.default;
    }
    files() {
        return {
            getCurrentDirectoryBase: files_1.getCurrentDirectoryBase,
            isDirectoryExists: files_1.isDirectoryExists,
            createDir: files_1.createDir,
            createJsonFile: files_1.createJsonFile,
            copyFolder: files_1.copyFolder,
            copyFile: files_1.copyFile
        };
    }
    api() {
        return {
            discover: {
                findComponents: discover_1.findComponents,
                findComponentsWithExt: discover_1.findComponentsWithExt,
                findDatasources: discover_1.findDatasources,
            },
            datasources: {
                getAllDatasources: datasources_1.getAllDatasources,
                getDatasource: datasources_1.getDatasource,
                getDatasourceEntries: datasources_1.getDatasourceEntries,
                createDatasource: datasources_1.createDatasource,
                createDatasourceEntry: datasources_1.createDatasourceEntry,
                updateDatasourceEntry: datasources_1.updateDatasourceEntry,
                updateDatasource: datasources_1.updateDatasource,
                createDatasourceEntries: datasources_1.createDatasourceEntries,
                syncDatasources: datasources_1.syncDatasources,
            },
            components: {
                getAllComponents: components_1.getAllComponents,
                getComponent: components_1.getComponent,
                getComponentsGroup: components_1.getComponentsGroup,
                getAllComponentsGroups: components_1.getAllComponentsGroups,
                createComponentsGroup: components_1.createComponentsGroup,
                syncComponents: migrate_1.syncComponents,
                syncAllComponents: migrate_1.syncAllComponents,
                updateComponent: mutateComponents_1.updateComponent,
                createComponent: mutateComponents_1.createComponent
            },
            presets: {
                getComponentPresets: componentPresets_1.getComponentPresets,
                getPreset: presets_1.getPreset,
                getAllPresets: presets_1.getAllPresets,
                createPreset: presets_1.createPreset,
                updatePreset: presets_1.updatePreset
            },
            spaces: {
                createSpace: spaces_1.createSpace,
                getSpace: spaces_1.getSpace
            }
        };
    }
}
exports.default = default_1;
