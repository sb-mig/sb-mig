import path from "path";
import dotenv from "dotenv";
import { defaultConfig, getStoryblokConfigContent } from "./helper.js";
import { pkg } from "../utils/pkg.js";

dotenv.config();

export interface IStoryblokConfig {
    storyblokComponentsLocalDirectory: string;
    sbmigWorkingDirectory: string;
    componentsDirectories: string[];
    schemaFileExt: string;
    datasourceExt: string;
    rolesExt: string;
    storyblokApiUrl: string;
    oauthToken: string;
    spaceId: string;
    accessToken: string;
    boilerplateSpaceId: number;
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
