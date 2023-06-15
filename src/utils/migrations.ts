import { createJsonFile, readFile } from "./files.js";

type MigrationNames =
    | "transitionsOnEnter"
    | "otherMigration"
    | "cardsMigration"
    | "hideToVisibility";

type VersionMapping = Record<string, MigrationNames[]>;

export const preselectMigrations = (
    currentVersion: string,
    installedVersion: string,
    versionMapping: VersionMapping,
    alreadyApplied: {
        story: string[];
        preset: string[];
    } = {
        story: [],
        preset: [],
    }
) => {
    const final = {
        story: [],
        preset: [],
    };

    const versionThatApplies = Object.keys(versionMapping).filter((version) => {
        if (version <= installedVersion && version > currentVersion) {
            return version;
        } else {
            return false;
        }
    });

    versionThatApplies.map((version) => {
        // @ts-ignore
        final.story.push(versionMapping[version]);
        // @ts-ignore
        final.preset.push(versionMapping[version]);
    });

    if (Array.isArray(alreadyApplied)) {
        alreadyApplied = {
            story: alreadyApplied,
            preset: [],
        };
    }

    const storyFlatted = final.story
        .flatMap((item) => item)
        .filter(
            (migration) => !alreadyApplied.story.includes(migration as string)
        );

    const presetFlatted = final.preset
        .flatMap((item) => item)
        .filter(
            (migration) => !alreadyApplied.preset.includes(migration as string)
        );

    return {
        story: storyFlatted,
        preset: presetFlatted,
    };
};

export const modifyOrCreateAppliedMigrationsFile = async (
    migrationApplied: string,
    itemType: "story" | "preset"
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
        alreadyApplied = {
            story: [],
            preset: [],
        };
    }

    if (Array.isArray(alreadyApplied)) {
        alreadyApplied = {
            story: alreadyApplied,
            preset: [],
        };
    }

    const migrations = {
        story:
            itemType === "story"
                ? [...new Set([...alreadyApplied.story, migrationApplied])]
                : alreadyApplied.story,
        preset:
            itemType === "preset"
                ? [...new Set([...alreadyApplied.preset, migrationApplied])]
                : alreadyApplied.preset,
    };

    const appliedMigrationsFileContent = JSON.stringify({
        migrations,
    });

    await createJsonFile(
        appliedMigrationsFileContent,
        "applied-backpack-migrations.json"
    );
};
