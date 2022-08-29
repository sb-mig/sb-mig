import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pkg = require(`${process.cwd()}/package.json`);

export { pkg };
