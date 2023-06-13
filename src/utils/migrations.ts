import { createJsonFile, readFile } from "./files.js";

type MigrationNames =
    | "transitionsOnEnter"
    | "otherMigration"
    | "cardsMigration"
    | "hideToVisibility";

type VersionMapping = Record<string, MigrationNames[]>;

const versionMapping: VersionMapping = {
    "1.6.0": ["transitionsOnEnter"],
    "1.6.1": ["otherMigration"],
    "1.7.0": ["cardsMigration", "hideToVisibility"],
};

export const preselectMigrations = (
    currentVersion: string,
    installedVersion: string,
    versionMapping: VersionMapping,
    alreadyApplied: string[] = []
) => {
    const final: (string | undefined)[] = [];

    const versionThatApplies = Object.keys(versionMapping).filter((version) => {
        if (version <= installedVersion && version > currentVersion) {
            return version;
        } else {
            return false;
        }
    });

    versionThatApplies.map((version) => {
        // @ts-ignore
        final.push(versionMapping[version]);
    });

    return final
        .flatMap((item) => item)
        .filter((migration) => !alreadyApplied.includes(migration as string));
};

// const migrations = preselectMigrations('1.6.1', '1.7.0', versionMapping);
//
// const commands = (list: MigrationNames[]) => list.map(migration => `yarn sb-mig migrate content --all --migration ${migration} --yes`);

export const modifyOrCreateAppliedMigrationsFile = async (
    migrationApplied: string
) => {
    const fileName = "applied-backpack-migrations.json";

    let alreadyAppliedFileContent;
    let alreadyApplied;
    try {
        alreadyAppliedFileContent = (await readFile(fileName)) as string;
        alreadyApplied = JSON.parse(alreadyAppliedFileContent).migrations;
    } catch (e) {
        console.log(`No file named: ${fileName}`);
        console.log("Will create one now.");
        alreadyApplied = [];
    }

    const migrations = [...new Set([...alreadyApplied, migrationApplied])];

    const appliedMigrationsFileContent = JSON.stringify({
        migrations,
    });

    await createJsonFile(
        appliedMigrationsFileContent,
        "applied-backpack-migrations.json"
    );
};
