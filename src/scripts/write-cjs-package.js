import fs from "fs";
import path from "path";

const outDir = path.resolve(process.cwd(), "dist-cjs");
const pkgPath = path.join(outDir, "package.json");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(pkgPath, JSON.stringify({ type: "commonjs" }, null, 2));

console.log(`[write-cjs-package] wrote ${pkgPath}`);
