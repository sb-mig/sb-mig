const path = require("path");

module.exports = {
    "src/**/!(*dist)/*.{js,jsx,ts,tsx}": [
        "npx prettier --write",
        "npm run lint:fix",
    ],
    "src/**/*.{ts,tsx}": [`tsc-files --noEmit`],
    "__tests__/**/*.{ts,tsx}": [
        `tsc-files --noEmit -p __tests__/tsconfig.json`,
    ],
};

/*
 *
 * tsc-files - is special util tool that help with checking types with lintstaged
 * without ignoring tsconfig.json (
 * - https://github.com/gustavopch/tsc-files
 * - https://dev.to/samueldjones/run-a-typescript-type-check-in-your-pre-commit-hook-using-lint-staged-husky-30id
 * ) we are also adding typings/declarations.d.ts to be always in the files list to check
 * because otherwise scss modules imports failed
 *
 * */
