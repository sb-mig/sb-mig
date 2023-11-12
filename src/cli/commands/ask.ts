import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import { Anton } from "@mrck-labs/anton-sdk";

import config from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { getFileContentWithRequire } from "../../utils/main.js";

export const ask = async (props: CLIOptions) => {
    const { input, flags } = props;

    try {
        const fileContent = await getFileContentWithRequire({
            file: path.join("..", "..", "package.json"),
        });

        const anton = new Anton(config.openaiToken);

        const question: string = input[1] as string;

        const cleanPackageJSON = {
            ...fileContent,
        };

        const cleanStoryblokConfig = {
            ...config,
            oauthToken: "hidden",
            openaiToken: "hidden",
        };

        Logger.warning("Got it! Thinking...");

        const data = await anton.chatCompletion({
            body: {
                messages: [
                    {
                        role: "system",
                        content: `Giving below context which is json object, answer the question asked with ONLY on using the CONTEXT.
            If u dont know the answet to question, simply say don't know. DO NOT try to generate answers at all cost if the context
            doesnt give you the answer.
            ### context start ###
            ${JSON.stringify(cleanStoryblokConfig, null, 2)}
            ${JSON.stringify(cleanPackageJSON, null, 2)}
            ### context end ###
            `,
                    },
                    {
                        role: "user",
                        content: question,
                    },
                ],
            },
        });

        Logger.success(data?.choices[0]?.message?.content);
    } catch (e) {
        Logger.warning("Can't find package.json");
    }
};
