#!/usr/bin/env node
const chalk = require("chalk");
const figlet = require("figlet");
const commander = require("commander");
const package = require("./package.json");
const fs = require("fs");
const Logger = require("./helpers/logger");
const restApi = require("./restApi");
const sbApi = require("./sbApi.js");
const program = new commander.Command();

async function start() {
  console.log(
    chalk.yellow(figlet.textSync("sb-mig", { horizontalLayout: "full" }))
  );
  try {
    program.version(package.version);

    program
      .option("-d, --debug", "Output extra debugging")
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
      .option("-s, --sb-client", "Make test request using StoryblokClient")
      .option(
        "-z, --get-sb-test-component <storyblok-component>",
        "Get test storyblok schema based component"
      )
      .option(
        "-x, --get-react-test-component <storyblok-react-component>",
        "Get test react matching to schema based component"
      );

    program.parse(process.argv);

    if (program.debug) console.log(program.opts());
    if (program.preset) {
      restApi.getPreset(program.preset).then(async res => {
        if (res) {
          const stringifiedResult = JSON.stringify(res);
          const randomDatestamp = new Date().toString();

          const filename = `preset-${program.preset}-${randomDatestamp}`;

          Logger.warning(
            `Preset for '${program.preset}' have been written to a file:  ${filename}`
          );

          await fs.promises.mkdir(`${process.cwd()}/sbmig/presets/`, {
            recursive: true
          });
          await fs.promises.writeFile(
            `./sbmig/presets/${filename}.json`,
            stringifiedResult,
            { flag: `w` }
          );
        }
      });
    }

    if (program.component) {
      restApi.getComponent(program.component).then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `component-${program.component}-${randomDatestamp}`;

        Logger.warning(
          `Component for ${program.component} written to a file:  ${filename}`
        );

        await fs.promises.mkdir(`${process.cwd()}/sbmig/components/`, {
          recursive: true
        });
        await fs.promises.writeFile(
          `./sbmig/components/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.componentPresets) {
      restApi.getComponentPresets(program.componentPresets).then(async res => {
        if (res) {
          const stringifiedResult = JSON.stringify(res);
          const randomDatestamp = new Date().toString();

          const filename = `component-${program.componentPresets}-all_presets-${randomDatestamp}`;

          Logger.warning(
            `Presets for ${program.componentPresets} written to a file:  ${filename}`
          );

          await fs.promises.mkdir(`${process.cwd()}/sbmig/component-presets/`, {
            recursive: true
          });
          await fs.promises.writeFile(
            `./sbmig/component-presets/${filename}.json`,
            stringifiedResult,
            { flag: `w` }
          );
        }
      });
    }

    if (program.allComponents) {
      restApi.getAllComponents().then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `all-components-backup-${randomDatestamp}`;

        Logger.warning(`All components written to a file:  ${filename}`);

        await fs.promises.mkdir(`${process.cwd()}/sbmig/components/`, {
          recursive: true
        });
        await fs.promises.writeFile(
          `./sbmig/components/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.allPresets) {
      restApi.getAllPresets().then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `all-presets-backup-${randomDatestamp}`;

        Logger.warning(`All presets written to a file:  ${filename}`);

        await fs.promises.mkdir(`${process.cwd()}/sbmig/presets/`, {
          recursive: true
        });
        await fs.promises.writeFile(
          `./sbmig/presets/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.sbClient) {
      sbApi
        .getAll("cdn/links", { version: "draft" })
        .then(results => console.log(results))
        .catch(err => console.log(err.message));
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  if (program.getSbTestComponent) {
    restApi.getStoryblokComponent(program.getSbTestComponent).then(async res => {
      const randomDatestamp = new Date().toString();

      const filename = `${program.getSbTestComponent}-${randomDatestamp}`;
      await fs.promises.mkdir(`${process.cwd()}/sbmig/storyblok/`, {
        recursive: true
      });
      const dest = await fs.createWriteStream(`./sbmig/storyblok/${filename}.js`);
      res.body.pipe(dest);
      Logger.log(`Storyblok schema for '${program.getSbTestComponent}' saved in a ${filename} file.`);
    });
  }

  if (program.getReactTestComponent) {
    restApi.getReactComponent(program.getReactTestComponent).then(async res => {
      const randomDatestamp = new Date().toString();

      const filename = `${program.getReactTestComponent}-${randomDatestamp}`;
      await fs.promises.mkdir(`${process.cwd()}/sbmig/react-match/`, {
        recursive: true
      });
      const dest = await fs.createWriteStream(`./sbmig/react-match/${filename}.js`);
      res.body.pipe(dest);
      Logger.log(`Storyblok react match component for '${program.getReactTestComponent}' saved in a ${filename} file.`);
    });
  }
}

start();
