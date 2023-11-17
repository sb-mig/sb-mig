import type { CLIOptions } from "../../utils/interfaces.js";

import path from "path";

import { Anton } from "@mrck-labs/anton-sdk";

import config from "../../config/config.js";
import Logger from "../../utils/logger.js";
import { getFileContentWithRequire } from "../../utils/main.js";
import * as descriptions from "../cli-descriptions.js";

export const ask = async (props: CLIOptions) => {
    const { input, flags } = props;

    console.log("whatever ?");

    try {
        const fileContent = await getFileContentWithRequire({
            file: path.join("..", "..", "package.json"),
        });

        const anton = new Anton(config.openaiToken);
        console.log(anton.setInitialMessages);

        // anton.doWhatever()
        anton.setInitialMessages([
            {
                role: "system",
                content: "Act like a lady from high house",
            },
        ]);

        const question: string = input[1] as string;

        const cleanPackageJSON = {
            ...fileContent,
            scripts: null,
        };

        const cleanStoryblokConfig = {
            ...config,
            oauthToken: "hidden",
            openaiToken: "hidden",
        };

        const cleanAllDescriptions = {
            ...descriptions,
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
            ${JSON.stringify(cleanStoryblokConfig, null, 0)}
            ${JSON.stringify(cleanPackageJSON, null, 0)}
            ${JSON.stringify(cleanAllDescriptions, null, 0)}
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
        console.log(e);
        Logger.warning("Can't find package.json");
    }
};
