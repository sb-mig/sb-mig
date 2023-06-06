import * as components from "./components/index.js";
import * as plugins from "./plugins/index.js";
import * as presets from "./presets/index.js";
import * as roles from "./roles/index.js";

export const managementApi = {
    plugins: { ...plugins },
    presets: { ...presets },
    components: { ...components },
    roles: { ...roles },
};
