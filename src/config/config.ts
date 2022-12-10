import path from "path";
import dotenv from "dotenv";
import { defaultConfig, getStoryblokConfigContent } from "./helper.js";
import { pkg } from "../utils/pkg.js";

dotenv.config();

export const SCHEMA = {
    TS: "ts",
    JS: "js",
} as const;

type SchemaType = typeof SCHEMA[keyof typeof SCHEMA];

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    componentsDirectories: string[];
    schemaFileExt: "sb.cjs" | "sb.js";
    datasourceExt: string;
    rolesExt: string;
    storyblokApiUrl: string;
    oauthToken: string;
    spaceId: string;
    accessToken: string;
    boilerplateSpaceId: number;
    schemaType: SchemaType;
    flushCache: boolean;
    cacheDir: string;
}

const filePath = path.resolve(process.cwd(), "storyblok.config");
const customConfig = await getStoryblokConfigContent({
    filePath,
    ext: ".js",
});

export default {
    ...defaultConfig(pkg, `${process.cwd()}`, process.env),
    ...customConfig,
};
