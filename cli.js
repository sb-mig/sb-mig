#!/usr/bin/env node
const Logger = require("./helpers/logger");
const commander = require("commander");
const fs = require("fs");
const package = require("./package.json");
const restApi = require("./restApi");
const migrate = require("./migrate");
const { sbmigWorkingDirectory } = require("./config");
const { createDir, createJsonFile } = require("./helpers/files");

const program = new commander.Command();

async function start() {
  Logger.bigLog("sb-mig");
  try {
    program.version(package.version);

    program
      .option(
        "-M, --migrate <component-name>",
        "(DEPRECATED in favor of --sync) Migrate single component using schema"
      )
      .option("-s, --sync", "Sync provided components from schema with")
      .option("-S, --sync-all", "Sync all components from schema with")
      .option("-g, --all-components-groups", "Get all component groups")
      .option(
        "-c, --components-group <components-group-name>",
        "Get single components group by name"
      )
      .option("-a, --all-components", "Get all components")
      .option(
        "-c, --component <component-name>",
        "Get single component by name"
      )
      .option("-q, --all-presets", "Get all presets")
      .option("-p, --preset <preset-id>", "Get preset by id")
      .option(
        "-d, --component-presets <component-name>",
        "Get all presets for single component by name"
      )
      .option(
        "-z, --get-sb-test-component <storyblok-component>",
        "Get test storyblok schema based component"
      )
      .option(
        "-x, --get-react-test-component <storyblok-react-component>",
        "Get test react matching to schema based component"
      )
      .option("-d, --debug", "Output extra debugging")
      .option("-T, --test", "Test things");

    program.parse(process.argv);

    if (program.test) {
      console.log("testing things");
    }

    if (program.sync) {
      Logger.log("Syncing provided components...");

      if (program.args.length === 0) {
        Logger.warning(
          `You have to provide some components separated with empty space. For exmaple: 'row column card'`
        );
      } else {
        migrate.syncComponents(program.args);
      }
    }

    if (program.syncAll) {
      Logger.log("Syncing all components...");
      migrate.syncAllComponents(program.sync);
    }

    if (program.migrate) {
      Logger.log("Migrating...");
      migrate.migrateComponent(program.migrate);
    }

    if (program.preset) {
      restApi.getPreset(program.preset).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON();
          const filename = `preset-${program.preset}-${randomDatestamp}`;
          await createDir(`${sbmigWorkingDirectory}/presets/`);
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/presets/${filename}.json`
          );
          Logger.success(
            `Preset for '${program.preset}' have been written to a file:  ${filename}`
          );
        }
      });
    }

    if (program.component) {
      restApi.getComponent(program.component).then(async res => {
        const randomDatestamp = new Date().toJSON();
        const filename = `component-${program.component}-${randomDatestamp}`;
        await createDir(`${sbmigWorkingDirectory}/components/`);
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/components/${filename}.json`
        );
        Logger.success(
          `Component for ${program.component} written to a file:  ${filename}`
        );
      });
    }

    if (program.componentPresets) {
      restApi.getComponentPresets(program.componentPresets).then(async res => {
        if (res) {
          const randomDatestamp = new Date().toJSON();
          const filename = `component-${program.componentPresets}-all_presets-${randomDatestamp}`;
          await createDir(`${sbmigWorkingDirectory}/component-presets/`);
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/component-presets/${filename}.json`
          );
          Logger.success(
            `Presets for ${program.componentPresets} written to a file:  ${filename}`
          );
        }
      });
    }

    if (program.allComponentsGroups) {
      restApi.getAllComponentsGroups().then(async res => {
        const randomDatestamp = new Date().toJSON();
        const filename = `all-component_groups-backup-${randomDatestamp}`;
        await createDir(`${sbmigWorkingDirectory}/component_groups/`);
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/component_groups/${filename}.json`
        );
        Logger.success(`All groups written to a file:  ${filename}`);
      });
    }

    if (program.componentsGroup) {
      restApi.getComponentsGroup(program.componentsGroup).then(async res => {
        const randomDatestamp = new Date().toJSON();
        const filename = `components_group-${program.componentsGroup}-${randomDatestamp}`;
        await createDir(`${sbmigWorkingDirectory}/component_groups/`);
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/component_groups/${filename}.json`
        );
        Logger.success(
          `Components group for ${program.componentsGroup} written to a file:  ${filename}`
        );
      });
    }

    if (program.allComponents) {
      restApi.getAllComponents().then(async res => {
        const randomDatestamp = new Date().toJSON();
        const filename = `all-components-backup-${randomDatestamp}`;
        await createDir(`${sbmigWorkingDirectory}/components/`);
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/components/${filename}.json`
        );
        Logger.success(`All components written to a file:  ${filename}`);
      });
    }

    if (program.allPresets) {
      restApi.getAllPresets().then(async res => {
        const randomDatestamp = new Date().toJSON();
        const filename = `all-presets-backup-${randomDatestamp}`;
        await createDir(`${sbmigWorkingDirectory}/presets/`);
        await createJsonFile(
          JSON.stringify(res),
          `${sbmigWorkingDirectory}/presets/${filename}.json`
        );
        Logger.success(`All presets written to a file:  ${filename}`);
      });
    }

    if (program.getSbTestComponent) {
      restApi
        .getStoryblokComponent(program.getSbTestComponent)
        .then(async res => {
          if (res) {
            const randomDatestamp = new Date().toJSON();
            const filename = `${program.getSbTestComponent}-${randomDatestamp}`;
            await createDir(`${sbmigWorkingDirectory}/storyblok/`);
            const dest = await fs.createWriteStream(
              `./${sbmigWorkingDirectory}/storyblok/${filename}.js`
            );
            res.body.pipe(dest);
            Logger.success(
              `Storyblok schema for '${program.getSbTestComponent}' saved in a ${filename} file.`
            );
          }
        });
    }

    if (program.getReactTestComponent) {
      restApi
        .getReactComponent(program.getReactTestComponent)
        .then(async res => {
          if (res) {
            const randomDatestamp = new Date().toJSON();
            const filename = `${program.getReactTestComponent}-${randomDatestamp}`;
            await fs.promises.mkdir(
              `${process.cwd()}/${sbmigWorkingDirectory}/react-match/`,
              {
                recursive: true
              }
            );
            const dest = await fs.createWriteStream(
              `./${sbmigWorkingDirectory}/react-match/${filename}.js`
            );
            res.body.pipe(dest);
            Logger.success(
              `Storyblok react match component for '${program.getReactTestComponent}' saved in a ${filename} file.`
            );
          }
        });
    }

    if (program.debug) console.log(program.opts());
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();
