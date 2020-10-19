import { flags } from "@oclif/command";
import Command from '../core'

import storyblokConfig from "../config/config";
import { getAllComponents, getComponent, getAllComponentsGroups, getComponentsGroup } from "../api/components";
import { getAllDatasources, getDatasource, getDatasourceEntries } from '../api/datasources';
import { getComponentPresets } from '../api/componentPresets';
import { getAllPresets, getPreset } from '../api/presets';
import Logger from "../utils/logger";
import { createDir, createJsonFile } from "../utils/files";
import { generateDatestamp } from '../utils/others'

export default class Backup extends Command {
  static description = "Command for backing up anything related to Storyblok";

  static flags = {
    help: flags.help({ char: "h" }),
    allComponents: flags.boolean({ char: "a", description: "Backup all components." }),
    oneComponent: flags.string({ char: "o", description: "Backup one component by name." }),
    allComponentsGroups: flags.boolean({ char: "g", description: "Backup all components groups." }),
    oneComponentsGroup: flags.string({ char: 'f', description: "Backup one components group by name." }),
    oneComponentPresets: flags.string({ char: 'p', description: "Backup all presets for one component" }),
    allPresets: flags.boolean({ char: 'l', description: "Backup all presets." }),
    onePreset: flags.string({ char: 'i', description: "Backup one preset by id." }),
    allDatasources: flags.boolean({ char: 'd', description: "Backup all datasources." }),
    oneDatasource: flags.string({ char: 'x', description: "Backup one datasource by name." }),
    datasourceEntries: flags.string({ char: 'e', description: "Backup one datasource entries by datasource name." })
  };

  static args = [];
  // static strict = false;

  async run() {
    const { args, flags, argv } = this.parse(Backup);

    // Backup all components as json file
    if (flags.allComponents) {
      return getAllComponents()
        .then(async (res: any) => {
          const datestamp = new Date();
          const filename = `all-components-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/components/`);
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/components/${filename}.json`
          );
          Logger.success(`All components written to a file:  ${filename}`);
          return true;
        })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }



    // Backup one component as json file
    if (flags.oneComponent) {
      return getComponent(flags.oneComponent).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `component-${flags.oneComponent}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/components/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/components/${filename}.json`
          )
          Logger.success(
            `Component for ${flags.oneComponent} written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.allComponentsGroups) {
      return getAllComponentsGroups().then(async res => {
        const datestamp = new Date();
        const filename = `all-component_groups-${generateDatestamp(datestamp)}`
        await createDir(`${storyblokConfig.sbmigWorkingDirectory}/component_groups/`)
        await createJsonFile(
          JSON.stringify(res, undefined, 2),
          `${storyblokConfig.sbmigWorkingDirectory}/component_groups/${filename}.json`
        )
        Logger.success(`All groups written to a file:  ${filename}`)
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.oneComponentsGroup) {
      return getComponentsGroup(flags.oneComponentsGroup).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `components_group-${flags.oneComponentsGroup}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/component_groups/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/component_groups/${filename}.json`
          )
          Logger.success(
            `Components group for ${flags.oneComponentsGroup} written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.allDatasources) {
      return getAllDatasources().then(async (res: any) => {
        const datestamp = new Date();
        const filename = `all-datasources-${generateDatestamp(datestamp)}`
        await createDir(`${storyblokConfig.sbmigWorkingDirectory}/datasources/`)
        await createJsonFile(
          JSON.stringify(res, undefined, 2),
          `${storyblokConfig.sbmigWorkingDirectory}/datasources/${filename}.json`
        )
        Logger.success(`All datasources written to a file:  ${filename}`)
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.oneDatasource) {
      return getDatasource(flags.oneDatasource).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `datasource-${flags.oneDatasource}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/datasources/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/datasources/${filename}.json`
          )
          Logger.success(
            `Datasource for ${flags.oneDatasource} written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.datasourceEntries) {
      return getDatasourceEntries(flags.datasourceEntries).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `datasource-entries-${flags.datasourceEntries}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/datasources/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/datasources/${filename}.json`
          )
          Logger.success(
            `Datasource entries for ${flags.datasourceEntries} written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.oneComponentPresets) {
      return getComponentPresets(flags.oneComponentPresets).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `component-${flags.oneComponentPresets}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/component-presets/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/component-presets/${filename}.json`
          )
          Logger.success(
            `Presets for ${flags.oneComponentPresets} written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.allPresets) {
      return getAllPresets().then(async (res: any) => {
        const datestamp = new Date();
        const filename = `all-presets-${generateDatestamp(datestamp)}`
        await createDir(`${storyblokConfig.sbmigWorkingDirectory}/presets/`)
        await createJsonFile(
          JSON.stringify(res, undefined, 2),
          `${storyblokConfig.sbmigWorkingDirectory}/presets/${filename}.json`
        )
        Logger.success(`All presets written to a file:  ${filename}`)
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    if (flags.onePreset) {
      return getPreset(flags.onePreset).then(async (res: any) => {
        if (res) {
          const datestamp = new Date();
          const filename = `preset-${flags.onePreset}-${generateDatestamp(datestamp)}`
          await createDir(`${storyblokConfig.sbmigWorkingDirectory}/presets/`)
          await createJsonFile(
            JSON.stringify(res, undefined, 2),
            `${storyblokConfig.sbmigWorkingDirectory}/presets/${filename}.json`
          )
          Logger.success(
            `Preset for '${flags.onePreset}' have been written to a file:  ${filename}`
          )
        }
      })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    }

    this.exit();
  }
}
