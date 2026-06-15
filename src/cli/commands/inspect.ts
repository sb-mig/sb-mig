import type { CLIOptions } from "../../utils/interfaces.js";

import { loadComponentUsageQuery } from "../../api/inspect/component-usage-query.js";
import { inspectStoryblokStories } from "../../api/inspect/component-usage.js";
import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";
import { getFrom } from "../utils/cli-utils.js";

const INSPECT_COMMANDS = {
    componentUsage: "component-usage",
};

const normalizeWithSlug = (
    withSlugFlag: string | string[] | undefined,
): string[] | undefined => {
    if (Array.isArray(withSlugFlag)) {
        return withSlugFlag.filter(Boolean);
    }

    if (typeof withSlugFlag === "string" && withSlugFlag.length > 0) {
        return [withSlugFlag];
    }

    return undefined;
};

const countSelectionModes = ({
    all,
    withSlug,
    startsWith,
}: {
    all?: boolean;
    withSlug?: string[];
    startsWith?: string;
}): number =>
    [
        Boolean(all),
        Boolean(withSlug && withSlug.length > 0),
        Boolean(startsWith),
    ].filter(Boolean).length;

const assertValidSelection = ({
    all,
    withSlug,
    startsWith,
}: {
    all?: boolean;
    withSlug?: string[];
    startsWith?: string;
}) => {
    const selectedModes = countSelectionModes({ all, withSlug, startsWith });

    if (selectedModes === 0) {
        throw new Error(
            "Missing story selection. Pass exactly one of --all, --withSlug, or --startsWith.",
        );
    }

    if (selectedModes > 1) {
        throw new Error(
            "Pass only one story selection mode: --all, --withSlug, or --startsWith.",
        );
    }
};

const printComponentUsageSummary = (report: {
    queryName: string;
    spaceId: string;
    totals: {
        storiesScanned: number;
        storiesMatched: number;
        matches: number;
    };
    matches: Array<{ storyFullSlug?: string; storySlug?: string }>;
}) => {
    Logger.log("Component usage inspection");
    Logger.log(`Space: ${report.spaceId}`);
    Logger.log(`Query: ${report.queryName}`);
    Logger.log(`Stories scanned: ${report.totals.storiesScanned}`);
    Logger.log(`Stories matched: ${report.totals.storiesMatched}`);
    Logger.log(`Total matches: ${report.totals.matches}`);

    const countsByStory = report.matches.reduce<Record<string, number>>(
        (acc, match) => {
            const slug = match.storyFullSlug || match.storySlug || "[unknown]";
            acc[slug] = (acc[slug] || 0) + 1;
            return acc;
        },
        {},
    );

    if (Object.keys(countsByStory).length === 0) {
        Logger.warning("No matches found.");
        return;
    }

    Logger.log("Matches by story:");
    for (const [slug, count] of Object.entries(countsByStory)) {
        Logger.log(`- ${slug}: ${count}`);
    }
};

export const inspect = async (props: CLIOptions) => {
    const { input, flags } = props;
    const command = input[1];

    switch (command) {
        case INSPECT_COMMANDS.componentUsage: {
            const from = getFrom(flags, apiConfig);
            const queryNameOrPath = flags["query"] as string | undefined;
            const withSlug = normalizeWithSlug(
                flags["withSlug"] as string | string[] | undefined,
            );
            const startsWith =
                (flags["startsWith"] as string | undefined) || undefined;
            const all = Boolean(flags["all"]);
            const outputPath = flags["outputPath"] as string | undefined;

            assertValidSelection({ all, withSlug, startsWith });

            if (!queryNameOrPath) {
                throw new Error(
                    "Missing query. Pass --query with a component usage query file name or path.",
                );
            }

            const query = await loadComponentUsageQuery(queryNameOrPath);
            const report = await inspectStoryblokStories(
                {
                    query,
                    spaceId: from,
                    filters: {
                        all: all || undefined,
                        withSlug,
                        startsWith,
                    },
                },
                apiConfig,
            );

            printComponentUsageSummary(report);

            if (outputPath) {
                await createAndSaveToFile(
                    {
                        path: outputPath,
                        res: report,
                    },
                    apiConfig,
                );
            }

            break;
        }

        default:
            throw new Error(
                "Unknown inspect command. Supported command: component-usage.",
            );
    }
};
