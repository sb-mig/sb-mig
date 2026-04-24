import type { SyncProvidedPlugins } from "./plugins.types.js";

import { readFile } from "../../utils/files.js";

import { syncPluginsData } from "./plugins.js";

export const syncProvidedPlugins: SyncProvidedPlugins = async (
    { plugins, dryRun },
    config,
) => {
    const body = dryRun ? "" : await readFile("dist/export.js");
    if (!body && !dryRun) {
        throw new Error("Unable to read plugin bundle from dist/export.js");
    }

    await syncPluginsData(
        {
            plugins: plugins.map((name) => ({
                name: String(name),
                body: body ?? "",
            })),
            dryRun,
        },
        config,
    );
};
