import fs from "fs";

if (process.platform !== "win32") {
    fs.chmodSync("./dist/cli/index.js", 0o755);
}
