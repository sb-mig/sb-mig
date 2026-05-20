import type { CLIOptions } from "../../utils/interfaces.js";

import { managementApi } from "../../api/managementApi.js";
import { apiConfig } from "../api-config.js";

export const languagePublishState = async ({ flags }: CLIOptions) => {
    const withSlugFlag = flags["withSlug"] as string | string[] | undefined;
    const withSlug = Array.isArray(withSlugFlag)
        ? withSlugFlag
        : withSlugFlag
          ? [withSlugFlag]
          : undefined;

    await managementApi.stories.buildLanguagePublishStateMap(
        {
            from: flags["from"] as string,
            accessToken: flags["accessToken"] as string | undefined,
            languages: flags["languages"] as string | undefined,
            startsWith: flags["startsWith"] as string | undefined,
            withSlug,
            fileName: flags["fileName"] as string | undefined,
            outputPath: flags["outputPath"] as string | undefined,
        },
        apiConfig,
    );
};
