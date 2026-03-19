import type { RollupOptions } from "rollup";

import { rollup } from "rollup";

/*
 *
 * Important docs for this file is on https://rollupjs.org/guide/en/#rolluprollup
 * basically using rollup programatically
 *
 * */

interface Build {
    inputOptions: RollupOptions;
    outputOptionsList: any;
}

export async function build({ inputOptions, outputOptionsList }: Build) {
    let bundle;
    try {
        bundle = await rollup(inputOptions);
        await generateOutputs({ bundle, outputOptionsList });
        return [];
    } catch (error) {
        console.error(error);
        throw error;
    } finally {
        if (bundle) {
            await bundle.close();
        }
    }
}

interface GenerateOutputs {
    bundle: any;
    outputOptionsList: any;
}

async function generateOutputs({ bundle, outputOptionsList }: GenerateOutputs) {
    for (const outputOptions of outputOptionsList) {
        const { output } = await bundle.write(outputOptions);

        for (const chunkOrAsset of output) {
            if (chunkOrAsset.type === "asset") {
                if (process.env["DEBUG"]) {
                    console.log("Asset", chunkOrAsset);
                }
            } else {
                if (process.env["DEBUG"]) {
                    console.log("Chunk", chunkOrAsset.modules);
                }
            }
        }
    }
}
