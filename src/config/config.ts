import type { IStoryblokConfig } from "./config.types.js";

import { SCHEMA } from "./helper.js";
import { resolveConfig } from "./resolve-config.js";

export { SCHEMA };
export type { IStoryblokConfig };

const resolved = await resolveConfig();

export default resolved.config as IStoryblokConfig;
