import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import storyblokConfig from "../../config/config.js";
import { createAndSaveComponentListToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import {
    discoverAllComponents,
    discoverAllMigrations,
    enrichMigrationInfo,
} from "../utils/discover.js";

const DISCOVER_COMMANDS = {
    components: "components",
    migrations: "migrations",
};

export const discover = async (props: CLIOptions) => {
    const { input, flags } = props;

    const command = input[1];

    switch (command) {
        case DISCOVER_COMMANDS.components:
            Logger.warning(`discover components... with command: ${command}`);

            if (flags["all"]) {
                Logger.log(
                    `Syncing ALL components with ${storyblokConfig.schemaFileExt} extension...`,
                );

                const allComponents = await discoverAllComponents();

                const content = [
                    ...allComponents.local.map((component: any) =>
                        component.name
                            .replaceAll(".sb.js", "")
                            .replaceAll(".sb.cjs", "")
                            .replaceAll(".sb.mjs", ""),
                    ),
                    ...allComponents.external.map((component: any) =>
                        component.name
                            .replaceAll(".sb.js", "")
                            .replaceAll(".sb.cjs", "")
                            .replaceAll(".sb.mjs", ""),
                    ),
                ];

                if (flags["write"]) {
                    await createAndSaveComponentListToFile(
                        {
                            file: flags["file"] || undefined,
                            res: content,
                        },
                        apiConfig,
                    );
                } else {
                    console.log(allComponents);
                }
            }

            break;
        case DISCOVER_COMMANDS.migrations:
            if (flags["all"]) {
                const allMigrations = discoverAllMigrations();
                const migrationInfos = await enrichMigrationInfo(allMigrations);

                for (const info of migrationInfos) {
                    console.log(path.basename(info.filePath));
                }
            }

            break;
        default:
            console.log(`no command like that: ${command}`);
    }
};
