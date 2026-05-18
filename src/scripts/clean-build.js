import fs from "fs";

for (const dir of ["dist", "dist-cjs"]) {
    fs.rmSync(dir, { recursive: true, force: true });
}
