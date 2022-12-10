import Logger from "../utils/logger.js";
import storyblokConfig from "../config/config.js";
import { discoverAllComponents } from "../api/migrate.js";
import { CLIOptions } from "../utils/interfaces.js";
import { createAndSaveComponentListToFile } from "../utils/files.js";

const DISCOVER_COMMANDS = {
    components: "components",
};

export const discover = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case DISCOVER_COMMANDS.components:
            Logger.warning(`discover components... with command: ${command}`);

            if (flags["all"]) {
                Logger.log(
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`
                );

                const allComponents = await discoverAllComponents();

                const content = [
                    ...allComponents.local.map((component: any) =>
                        component.name
                            .replaceAll(".sb.js", "")
                            .replaceAll(".sb.cjs", "")
                            .replaceAll(".sb.mjs", "")
                    ),
                    ...allComponents.external.map((component: any) =>
                        component.name
                            .replaceAll(".sb.js", "")
                            .replaceAll(".sb.cjs", "")
                            .replaceAll(".sb.mjs", "")
                    ),
                ];

                Logger.success("#### Discovered components  ####");
                console.log(content);

                if (flags["write"]) {
                    await createAndSaveComponentListToFile({
                        file: flags["file"] || undefined,
                        res: content,
                    });
                }
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
