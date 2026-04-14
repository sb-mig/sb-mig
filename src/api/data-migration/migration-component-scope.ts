import type { MapperDefinition } from "./component-data-migration.js";

export type MigrationComponentAliasesByMigration = Record<
    string,
    Record<string, string[]>
>;

export type MigrationComponentOverridesByMigration = Record<string, string[]>;

const normalizeFlagValues = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }

    if (typeof value === "string" && value.length > 0) {
        return [value];
    }

    return [];
};

export const parseMigrationComponentAliasFlags = (
    value: string | string[] | undefined,
): MigrationComponentAliasesByMigration => {
    const result: MigrationComponentAliasesByMigration = {};

    normalizeFlagValues(value).forEach((entry) => {
        const [migrationName, mapping] = entry.split(":");
        const [sourceComponent, aliasesRaw] = (mapping || "").split("=");
        const aliases = (aliasesRaw || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

        if (!migrationName || !sourceComponent || aliases.length === 0) {
            throw new Error(
                `Invalid --migrationComponentAlias value '${entry}'. Expected '<migration>:<source>=<alias1>,<alias2>'.`,
            );
        }

        result[migrationName] = result[migrationName] || {};
        result[migrationName]![sourceComponent] = [
            ...(result[migrationName]![sourceComponent] || []),
            ...aliases,
        ];
    });

    return result;
};

export const parseMigrationComponentOverrideFlags = (
    value: string | string[] | undefined,
): MigrationComponentOverridesByMigration => {
    const result: MigrationComponentOverridesByMigration = {};

    normalizeFlagValues(value).forEach((entry) => {
        const [migrationName, componentsRaw] = entry.split(":");
        const components = (componentsRaw || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

        if (!migrationName || components.length === 0) {
            throw new Error(
                `Invalid --migrationComponents value '${entry}'. Expected '<migration>:<component1>,<component2>'.`,
            );
        }

        result[migrationName] = components;
    });

    return result;
};

export const extendMigrationMapperWithAliases = (
    mapper: Record<string, MapperDefinition>,
    aliases: Record<string, string[]> | undefined,
): Record<string, MapperDefinition> => {
    if (!aliases) {
        return mapper;
    }

    const extendedMapper = { ...mapper };

    Object.entries(aliases).forEach(([sourceComponent, extraComponents]) => {
        const sourceMapper = mapper[sourceComponent];

        if (!sourceMapper) {
            throw new Error(
                `Cannot alias migration component '${sourceComponent}' because it is not defined in the migration config.`,
            );
        }

        extraComponents.forEach((extraComponent) => {
            extendedMapper[extraComponent] = sourceMapper;
        });
    });

    return extendedMapper;
};

export const resolveMigrationComponentsToMigrate = ({
    mapper,
    migrationName,
    globalComponentsToMigrate,
    perMigrationOverrides,
}: {
    mapper: Record<string, MapperDefinition>;
    migrationName: string;
    globalComponentsToMigrate?: string[];
    perMigrationOverrides?: MigrationComponentOverridesByMigration;
}): string[] => {
    const resolvedComponents =
        perMigrationOverrides?.[migrationName] &&
        perMigrationOverrides[migrationName]!.length > 0
            ? perMigrationOverrides[migrationName]!
            : globalComponentsToMigrate && globalComponentsToMigrate.length > 0
              ? globalComponentsToMigrate
              : Object.keys(mapper);

    const missingComponents = resolvedComponents.filter(
        (componentName) => !mapper[componentName],
    );

    if (missingComponents.length > 0) {
        throw new Error(
            `Migration '${migrationName}' cannot run for unknown components: ${missingComponents.join(
                ", ",
            )}. Add aliases first or adjust the component override list.`,
        );
    }

    return resolvedComponents;
};
