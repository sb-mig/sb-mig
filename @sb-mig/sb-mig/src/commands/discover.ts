import { flags } from "@oclif/command";
import Command from "../core";
import storyblokConfig from "../config/config";
import Logger from "../utils/logger";
import {
    sync2AllComponents,
    syncAllComponents,
    syncComponents,
    syncProvidedComponents,
} from "../api/migrate";
import { SWAP_TOKEN } from '../config/StoryblokComponentsConfig';

export default class Sync extends Command {
    static description = "Discover!!!!!!!!!!!!!!!!!!!!!!";

    static examples = [`$ sb-mig sync discover`];

    static flags = {
        help: flags.help({ char: "h" }),
    };

    static strict = false;

    async run() {
        const { argv, args, flags } = this.parse(Sync);
        const components = argv.splice(1, argv.length);

        console.log("eh discoiver...")

        // const crumb1 = this.storyblokComponentsConfig().createCrumb({to: storyblokConfig.componentsMatchFile, token: SWAP_TOKEN.componentImports})
        // const crumb2 = this.storyblokComponentsConfig().createCrumb({to: storyblokConfig.componentsMatchFile, token: SWAP_TOKEN.componentLists})
        // const crumb3 = this.storyblokComponentsConfig().createCrumb({to: storyblokConfig.componentsStylesMatchFile, token: SWAP_TOKEN.styleImports})

        // console.log("\n")
        // console.log(crumb1.join("\n"))
        // console.log("\n")
        // console.log(crumb2.join("\n"))
        // console.log("\n")
        // console.log(crumb3.join("\n"))
        // console.log("\n")
    }
}
