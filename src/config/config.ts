import type { IStoryblokConfig } from "./config.types.js";

import path from "path";

import dotenv from "dotenv";

import { pkg } from "../utils/pkg.js";

import { defaultConfig, getStoryblokConfigContent, SCHEMA } from "./helper.js";

dotenv.config();

export { SCHEMA };
export type { IStoryblokConfig };

const filePath = path.resolve(process.cwd(), "storyblok.config");

const customConfig = await getStoryblokConfigContent({
    filePath,
    ext: ".js",
});

export default {
    ...defaultConfig(pkg, `${process.cwd()}`, process.env),
    ...customConfig,
} as IStoryblokConfig;
