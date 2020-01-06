#!/usr/bin/env node
const commander = require("commander");
const package = require("./package.json");
const fs = require("fs");
const restApi = require("./restApi");
const { sbApi } = require("./sbApi.js");
const program = new commander.Command();

async function start() {
  try {
    program.version(package.version);

    program
      .option("-d, --debug", "Output extra debugging")
      .option("-a, --all-components", "Get all components")
      .option("-c, --component <type>", "Get single component")
      .option("-q, --all-presets", "Get all presets")
      .option("-p, --preset <type>", "Get preset by id")
      .option(
        "-d, --component-presets <type>",
        "Get all presets for single component"
      )
      .option("-s, --sb-client", "Make test request using StoryblokClient");

    program.parse(process.argv);

    if (program.debug) console.log(program.opts());
    if (program.preset) {
      console.log(`- ${program.preset}`);

      restApi.getPreset(program.preset).then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `preset-${program.preset}-${randomDatestamp}`;

        console.warn(
          `Preset for '${program.preset}' have been written to a file:  ${filename}`
        );

        await fs.promises.mkdir(`${process.cwd()}/sbmig/presets/`, { recursive: true });
        await fs.promises.writeFile(
          `./sbmig/presets/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.component) {
      console.warn(`- ${program.component}`);

      // restApi.getComponent(program.component);

      restApi.getComponent(program.component).then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `component-${program.component}-${randomDatestamp}`;

        console.warn(
          `Component for ${program.component} written to a file:  ${filename}`
        );

        await fs.promises.mkdir(`${process.cwd()}/sbmig/components/`, { recursive: true });
        await fs.promises.writeFile(
          `./sbmig/components/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.componentPresets) {
      console.warn(`- ${program.componentPresets}`);

      restApi.getComponentPresets(program.componentPresets).then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `component-${program.componentPresets}-all_presets-${randomDatestamp}`;

        console.warn(
          `Presets for ${program.componentPresets} written to a file:  ${filename}`
        );

        await fs.promises.mkdir(`${process.cwd()}/sbmig/component-presets/`, { recursive: true });
        await fs.promises.writeFile(
          `./sbmig/component-presets/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.allComponents) {
      restApi.getAllComponents().then(async res => {
        const stringifiedResult = JSON.stringify(res);
        const randomDatestamp = new Date().toString();

        const filename = `all-components-backup-${randomDatestamp}`;

        console.warn(`All components written to a file:  ${filename}`);

        await fs.promises.mkdir(`${process.cwd()}/sbmig/components/`, { recursive: true });
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

        console.warn(`All presets written to a file:  ${filename}`);

        await fs.promises.mkdir(`${process.cwd()}/sbmig/`, { recursive: true });
        await fs.promises.writeFile(
          `./sbmig/${filename}.json`,
          stringifiedResult,
          { flag: `w` }
        );
      });
    }

    if (program.sbClient) {
      sbApi
        .getAll("cdn/links", { version: "draft" })
        .then(results => console.log(results));
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  }
}

start();
