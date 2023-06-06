import * as components from "./components";
import * as plugins from "./plugins";
import * as presets from "./presets";

export const managementApi = {
    plugins: { ...plugins },
    presets: { ...presets },
    components: { ...components },
};
