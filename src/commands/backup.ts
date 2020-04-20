import { Command, flags } from "@oclif/command";

import { sbmigWorkingDirectory } from "../config/config";
import { getAllComponents, getComponent  } from "../api/components";
import Logger from "../utils/logger";
import { createDir, createJsonFile } from "../utils/files";

export default class Backup extends Command {
  static description = "Backup your Storyblok components";

  static flags = {
    all: flags.boolean({ char: "a", description: "Backup all components." }),
    single: flags.string({
      char: "s",
      description: "Backup provided single component",
    }),
    help: flags.help({ char: "h" }),
  };

  static args = [];

  async run() {
    const { args, flags } = this.parse(Backup);


    if(flags.single) {
      return getComponent(flags.single).then(async (res: any) => {
        if (res) {
          const randomDatestamp = new Date().toJSON()
          const filename = `component-${flags.single}-${randomDatestamp}`
          await createDir(`${sbmigWorkingDirectory}/components/`)
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/components/${filename}.json`
          )
          Logger.success(
            `Component for ${flags.single} written to a file:  ${filename}`
          )
          return true;
        }
      })
    }

    if (flags.all) {
      return getAllComponents()
        .then(async (res: any) => {
          const randomDatestamp = new Date().toJSON();
          const filename = `all-components-${randomDatestamp}`;
          await createDir(`${sbmigWorkingDirectory}/components/`);
          await createJsonFile(
            JSON.stringify(res),
            `${sbmigWorkingDirectory}/components/${filename}.json`
          );
          Logger.success(`All components written to a file:  ${filename}`);
          return true;
        })
        .catch((err: any) => {
          console.log(err);
          this.error("error happened... :(");
        });
    } else {
      console.log("zjebales...");
    }

    this.exit();
  }
}
