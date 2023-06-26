import * as assets from "./assets/index.js";
import * as auth from "./auth/index.js";
import * as components from "./components/index.js";
import * as datasources from "./datasources/index.js";
import * as plugins from "./plugins/index.js";
import * as presets from "./presets/index.js";
import * as roles from "./roles/index.js";
import * as spaces from "./spaces/index.js";
import * as stories from "./stories/index.js";

export const testApi = {
    assets: { ...assets },
    auth: { ...auth },
    components: { ...components },
    datasources: { ...datasources },
    plugins: { ...plugins },
    presets: { ...presets },
    roles: { ...roles },
    stories: { ...stories },
    spaces: { ...spaces },
};
