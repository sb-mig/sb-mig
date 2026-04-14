import { describe, expect, it } from "vitest";

import {
    buildPreMigrationBackupBaseName,
    buildStoryBackupBaseName,
    resolveOutputFileBaseName,
} from "../../src/api/data-migration/file-naming.js";

describe("migration file naming", () => {
    it("uses the provided fileName as the stable artifact base name", () => {
        expect(
            resolveOutputFileBaseName({
                from: "291250444542472",
                fileName: "test migration run",
            }),
        ).toBe("test-migration-run");
    });

    it("sanitizes fallback names derived from the source identifier", () => {
        expect(
            resolveOutputFileBaseName({
                from: "space/291250444542472",
            }),
        ).toBe("space-291250444542472");
    });

    it("builds a short pre-migration backup base name", () => {
        expect(
            buildPreMigrationBackupBaseName({
                from: "291250444542472",
            }),
        ).toBe("before__291250444542472");
    });

    it("builds a short story backup base name", () => {
        expect(
            buildStoryBackupBaseName({
                from: "291250444542472",
                fileName: "all",
            }),
        ).toBe("all--backup-before-migration");
    });
});
