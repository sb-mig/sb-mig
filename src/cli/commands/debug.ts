import { fileURLToPath } from "url";
import { inspect } from "util";

import { resolveConfig } from "../../config/resolve-config.js";
import { pkg } from "../../utils/pkg.js";
import { redactDebugSecrets } from "../utils/debug-redaction.js";

export const debug = async (cli?: { flags?: { json?: boolean } }) => {
    const resolved = await resolveConfig({ quiet: true });
    const ownPackage = pkg(
        fileURLToPath(new URL("../../../package.json", import.meta.url)),
    );
    const consumerPackage = resolved.paths.packageJsonExists
        ? pkg(resolved.paths.packageJson)
        : {};
    const report = redactDebugSecrets(
        {
            version: ownPackage.version,
            nodeVersion: process.version,
            paths: resolved.paths,
            configError: resolved.configError,
            dependencies: {
                "storyblok-js-client":
                    ownPackage.dependencies?.["storyblok-js-client"] ?? null,
                typescript: ownPackage.dependencies?.typescript ?? null,
                "@ef-global/backpack":
                    consumerPackage.dependencies?.["@ef-global/backpack"] ??
                    null,
            },
            moduleType: consumerPackage.type ?? "commonjs",
            config: resolved.config,
        },
        process.env,
    );

    console.log(
        cli?.flags?.json
            ? JSON.stringify(report, null, 2)
            : inspect(report, {
                  depth: null,
                  colors: false,
                  maxArrayLength: null,
                  maxStringLength: null,
              }),
    );
};
