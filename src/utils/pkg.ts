import { createRequire } from "module";
const require = createRequire(import.meta.url);

// return require(`${process.cwd()}/package.json`);

const pkg = (path: string) => {
    return require(path);
};

export { pkg };
