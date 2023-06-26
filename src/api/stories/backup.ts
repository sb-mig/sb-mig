import type { BackupStories } from "./stories.types.js";

import { createAndSaveToFile } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

import { getAllStories } from "./stories.js";

export const backupStories: BackupStories = async (
    { suffix, spaceId, filename },
    config
) => {
    Logger.log(`Making backup of your stories.`);
    await getAllStories({ ...config, spaceId })
        .then(async (res: any) => {
            await createAndSaveToFile(
                {
                    ext: "json",
                    filename: filename,
                    datestamp: true,
                    suffix,
                    folder: "stories",
                    res,
                },
                config
            );
        })
        .catch((err: any) => {
            Logger.error(err);
            Logger.error("error happened... :(");
        });
};
