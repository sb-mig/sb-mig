import { existsSync, readdirSync } from "fs";
import path from "path";

import { getFileContentWithRequire } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

export type MigrationValidationIssue = {
    componentPath: string;
    component: string;
    uid: string | null;
    message: string;
};

type Observation = {
    fields: Set<string>;
    legacyItemBasis: string[];
    legacyEmbedWidth: string[];
    legacyEmbedHeight: string[];
};

export type ComponentRule = {
    forbiddenFields?: string[];
    requiredFields?: string[];
    forbiddenTopLevelKeys?: string[];
    requiredTopLevelKeys?: string[];
    checkItemBasis?: boolean;
    checkEmbedSizes?: boolean;
};

export type WrapperNormalizationRule = {
    wrapperToBase: Record<string, string>;
};

export type RuleSetConfig = {
    ruleSetName: string;
    rules: Record<string, ComponentRule>;
    noIssuesMessage: string;
    wrapperNormalization?: WrapperNormalizationRule;
};

export type MigrationValidationDataFn = (args: {
    data: unknown;
    isDebug?: boolean;
}) => MigrationValidationReport | Promise<MigrationValidationReport>;

export type PreparedMigrationValidator = {
    id: string;
    name: string;
    ruleSet?: RuleSetConfig;
    validateData?: MigrationValidationDataFn;
    sourcePath: string;
};

export type MigrationValidationReport = {
    ok: boolean;
    issueCount: number;
    issues: MigrationValidationIssue[];
};

export class MigrationValidationFailedError extends Error {
    migrationConfig: string;
    validatorId: string;
    validatorName: string;
    issueCount: number;
    issues: MigrationValidationIssue[];

    constructor({
        migrationConfig,
        validatorId,
        validatorName,
        issueCount,
        issues,
    }: {
        migrationConfig: string;
        validatorId: string;
        validatorName: string;
        issueCount: number;
        issues: MigrationValidationIssue[];
    }) {
        super(
            `Validation failed for migration '${migrationConfig}' via '${validatorId}' (${issueCount} issue(s)).`,
        );

        this.name = "MigrationValidationFailedError";
        this.migrationConfig = migrationConfig;
        this.validatorId = validatorId;
        this.validatorName = validatorName;
        this.issueCount = issueCount;
        this.issues = issues;
    }
}

const maxFormatSamplesPerComponent = 3;

const validationFileRegex = /\.validation\.(cjs|js|mjs)$/;

const dedupe = <T>(items: T[]): T[] => Array.from(new Set(items));

const debugLog = (isDebug: boolean, message: string) => {
    if (isDebug) {
        Logger.warning(`[VALIDATION] ${message}`);
    }
};

const getObservation = (
    observations: Map<string, Observation>,
    key: string,
): Observation => {
    const existing = observations.get(key);
    if (existing) return existing;

    const created: Observation = {
        fields: new Set<string>(),
        legacyItemBasis: [],
        legacyEmbedWidth: [],
        legacyEmbedHeight: [],
    };

    observations.set(key, created);
    return created;
};

const getKeySet = (map: Map<string, Set<string>>, key: string): Set<string> => {
    const existing = map.get(key);
    if (existing) return existing;

    const created = new Set<string>();
    map.set(key, created);
    return created;
};

const formatPath = (pathParts: (string | number)[]): string => {
    return pathParts
        .map((segment, index) => {
            if (typeof segment === "number") return `[${segment}]`;
            if (index === 0) return segment;
            return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)
                ? `.${segment}`
                : `["${segment}"]`;
        })
        .join("");
};

const formatRelativePath = (pathParts: (string | number)[]): string =>
    formatPath(pathParts);

const pathKey = (pathParts: (string | number)[]): string => {
    return pathParts
        .map((segment) =>
            typeof segment === "number" ? `n:${segment}` : `s:${segment}`,
        )
        .join("|");
};

const isLegacySizeValue = (value: unknown): boolean => {
    if (value === null) return false;
    if (typeof value === "string") return true;
    if (typeof value === "number") return true;
    if (typeof value === "boolean") return true;
    if (typeof value !== "object") return false;

    const maybeSize = value as { value?: unknown; unit?: unknown };
    return !(
        typeof maybeSize.value === "string" &&
        typeof maybeSize.unit === "string"
    );
};

const traverse = (
    value: unknown,
    visitor: (
        currentValue: unknown,
        key: string | number,
        pathParts: (string | number)[],
    ) => void,
    pathParts: (string | number)[] = [],
): void => {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const childPath = [...pathParts, i];
            visitor(value[i], i, childPath);
            traverse(value[i], visitor, childPath);
        }
        return;
    }

    if (value !== null && typeof value === "object") {
        for (const key of Object.keys(value as Record<string, unknown>)) {
            const childPath = [...pathParts, key];
            const childValue = (value as Record<string, unknown>)[key];

            visitor(childValue, key, childPath);
            traverse(childValue, visitor, childPath);
        }
    }
};

const isRuleSetConfig = (value: unknown): value is RuleSetConfig => {
    if (!value || typeof value !== "object") return false;

    const maybe = value as {
        ruleSetName?: unknown;
        rules?: unknown;
        noIssuesMessage?: unknown;
    };

    return (
        typeof maybe.ruleSetName === "string" &&
        Boolean(maybe.rules) &&
        typeof maybe.rules === "object" &&
        typeof maybe.noIssuesMessage === "string"
    );
};

const toPreparedValidator = (
    moduleValue: unknown,
    sourcePath: string,
): PreparedMigrationValidator | null => {
    if (!moduleValue || typeof moduleValue !== "object") {
        return null;
    }

    const maybe = moduleValue as {
        id?: unknown;
        name?: unknown;
        ruleSet?: unknown;
        validateData?: unknown;
    };

    if (typeof maybe.id !== "string" || typeof maybe.name !== "string") {
        return null;
    }

    const ruleSet = isRuleSetConfig(maybe.ruleSet) ? maybe.ruleSet : undefined;
    const validateData =
        typeof maybe.validateData === "function"
            ? (maybe.validateData as MigrationValidationDataFn)
            : undefined;

    if (!ruleSet && !validateData) {
        return null;
    }

    return {
        id: maybe.id,
        name: maybe.name,
        ruleSet,
        validateData,
        sourcePath,
    };
};

const resolveValidatorPathCandidates = ({
    migrationConfigName,
    migrationConfigPath,
}: {
    migrationConfigName: string;
    migrationConfigPath: string;
}): string[] => {
    const directReplaced = migrationConfigPath.replace(
        /\.sb\.migration\.(cjs|js|mjs)$/,
        ".validation.$1",
    );

    const migrationDir = path.dirname(migrationConfigPath);
    const byNameInSameDir = [
        path.join(migrationDir, `${migrationConfigName}.validation.cjs`),
        path.join(migrationDir, `${migrationConfigName}.validation.js`),
        path.join(migrationDir, `${migrationConfigName}.validation.mjs`),
    ];

    const discoveredInDir = readdirSync(migrationDir)
        .filter((fileName) => validationFileRegex.test(fileName))
        .map((fileName) => path.join(migrationDir, fileName));

    return dedupe([
        directReplaced,
        ...byNameInSameDir,
        ...discoveredInDir,
    ]).filter((candidatePath) => existsSync(candidatePath));
};

export const discoverMigrationValidatorForMigrationFile = ({
    migrationConfigName,
    migrationConfigPath,
}: {
    migrationConfigName: string;
    migrationConfigPath: string;
}): PreparedMigrationValidator | null => {
    const candidates = resolveValidatorPathCandidates({
        migrationConfigName,
        migrationConfigPath,
    });

    for (const candidatePath of candidates) {
        try {
            const loaded = getFileContentWithRequire({ file: candidatePath });
            const prepared = toPreparedValidator(loaded, candidatePath);

            if (prepared) {
                return prepared;
            }
        } catch {
            // ignore candidate and continue
        }
    }

    return null;
};

export const validateRuleSetData = ({
    data,
    ruleSet,
    isDebug = false,
}: {
    data: unknown;
    ruleSet: RuleSetConfig;
    isDebug?: boolean;
}): MigrationValidationReport => {
    const trackedFields = new Set(
        Object.values(ruleSet.rules).flatMap((rule) => [
            ...(rule.forbiddenFields ?? []),
            ...(rule.requiredFields ?? []),
        ]),
    );

    const hasItemBasisChecks = Object.values(ruleSet.rules).some(
        (rule) => rule.checkItemBasis,
    );
    const hasEmbedSizeChecks = Object.values(ruleSet.rules).some(
        (rule) => rule.checkEmbedSizes,
    );

    const targetComponents = new Set(Object.keys(ruleSet.rules));
    const normalizedWrappers =
        ruleSet.wrapperNormalization?.wrapperToBase ?? {};
    const trackedWrapperComponents = new Set(Object.keys(normalizedWrappers));

    const componentByPathKey = new Map<string, string>();
    const pathByKey = new Map<string, (string | number)[]>();
    const uidByPathKey = new Map<string, string>();
    const observations = new Map<string, Observation>();
    const objectKeysByPathKey = new Map<string, Set<string>>();

    traverse(data, (value, key, pathParts) => {
        if (typeof key === "string") {
            const parentPath = pathParts.slice(0, -1);
            const parentKey = pathKey(parentPath);
            const keySet = getKeySet(objectKeysByPathKey, parentKey);
            keySet.add(key);
            pathByKey.set(parentKey, parentPath);
        }

        if (key === "component" && typeof value === "string") {
            const componentPath = pathParts.slice(0, -1);
            const keyStr = pathKey(componentPath);
            componentByPathKey.set(keyStr, value);
            pathByKey.set(keyStr, componentPath);

            if (
                targetComponents.has(value) ||
                trackedWrapperComponents.has(value)
            ) {
                debugLog(
                    isDebug,
                    `found target component ${value} at ${formatPath(componentPath) || "(root)"}`,
                );
            }
        }

        if (key === "_uid" && typeof value === "string") {
            const componentPath = pathParts.slice(0, -1);
            const keyStr = pathKey(componentPath);
            uidByPathKey.set(keyStr, value);
            pathByKey.set(keyStr, componentPath);
        }

        const designIndex = pathParts.indexOf("design");
        if (designIndex === -1) return;
        if (pathParts[designIndex + 1] !== "fields") return;

        const fieldName = pathParts[designIndex + 2];
        if (typeof fieldName !== "string") return;

        const componentPath = pathParts.slice(0, designIndex);
        const keyStr = pathKey(componentPath);
        pathByKey.set(keyStr, componentPath);
        const observation = getObservation(observations, keyStr);

        if (pathParts.length === designIndex + 3) {
            observation.fields.add(fieldName);
        }

        if (
            trackedFields.has(fieldName) &&
            pathParts.length === designIndex + 3
        ) {
            debugLog(
                isDebug,
                `saw design.fields.${fieldName} at ${formatPath(pathParts.slice(0, designIndex + 3))}`,
            );
        }

        if (pathParts[designIndex + 3] !== "values") return;
        if (pathParts.length !== designIndex + 5) return;

        const valuePath = formatRelativePath(pathParts.slice(designIndex + 3));

        if (
            hasItemBasisChecks &&
            fieldName === "item_basis" &&
            isLegacySizeValue(value)
        ) {
            if (
                observation.legacyItemBasis.length <
                maxFormatSamplesPerComponent
            ) {
                observation.legacyItemBasis.push(valuePath);
            }
        }

        if (
            hasEmbedSizeChecks &&
            fieldName === "embed_width" &&
            isLegacySizeValue(value)
        ) {
            if (
                observation.legacyEmbedWidth.length <
                maxFormatSamplesPerComponent
            ) {
                observation.legacyEmbedWidth.push(valuePath);
            }
        }

        if (
            hasEmbedSizeChecks &&
            fieldName === "embed_height" &&
            isLegacySizeValue(value)
        ) {
            if (
                observation.legacyEmbedHeight.length <
                maxFormatSamplesPerComponent
            ) {
                observation.legacyEmbedHeight.push(valuePath);
            }
        }
    });

    const issues: MigrationValidationIssue[] = [];

    for (const [keyStr, component] of componentByPathKey.entries()) {
        const componentPath = pathByKey.get(keyStr) ?? [];
        const componentPathStr = formatPath(componentPath) || "(root)";
        const uid = uidByPathKey.get(keyStr) ?? null;
        const topLevelKeys =
            objectKeysByPathKey.get(keyStr) ?? new Set<string>();
        const observation =
            observations.get(keyStr) ??
            ({
                fields: new Set<string>(),
                legacyItemBasis: [],
                legacyEmbedWidth: [],
                legacyEmbedHeight: [],
            } as Observation);

        if (!ruleSet.rules[component] && !normalizedWrappers[component]) {
            continue;
        }

        const rule = ruleSet.rules[component];

        if (rule) {
            for (const field of rule.forbiddenFields ?? []) {
                if (observation.fields.has(field)) {
                    issues.push({
                        componentPath: componentPathStr,
                        component,
                        uid,
                        message: `Forbidden field still present: design.fields.${field}`,
                    });
                }
            }

            for (const field of rule.requiredFields ?? []) {
                if (!observation.fields.has(field)) {
                    issues.push({
                        componentPath: componentPathStr,
                        component,
                        uid,
                        message: `Required field missing: design.fields.${field}`,
                    });
                }
            }

            for (const topLevelKey of rule.forbiddenTopLevelKeys ?? []) {
                if (topLevelKeys.has(topLevelKey)) {
                    issues.push({
                        componentPath: componentPathStr,
                        component,
                        uid,
                        message: `Forbidden top-level key still present: ${topLevelKey}`,
                    });
                }
            }

            for (const topLevelKey of rule.requiredTopLevelKeys ?? []) {
                if (!topLevelKeys.has(topLevelKey)) {
                    issues.push({
                        componentPath: componentPathStr,
                        component,
                        uid,
                        message: `Required top-level key missing: ${topLevelKey}`,
                    });
                }
            }

            if (rule.checkItemBasis && observation.legacyItemBasis.length > 0) {
                issues.push({
                    componentPath: componentPathStr,
                    component,
                    uid,
                    message: `item_basis values still in V3 format (${observation.legacyItemBasis.join(", ")})`,
                });
            }

            if (
                rule.checkEmbedSizes &&
                observation.legacyEmbedWidth.length > 0
            ) {
                issues.push({
                    componentPath: componentPathStr,
                    component,
                    uid,
                    message: `embed_width values still in V3 format (${observation.legacyEmbedWidth.join(", ")})`,
                });
            }

            if (
                rule.checkEmbedSizes &&
                observation.legacyEmbedHeight.length > 0
            ) {
                issues.push({
                    componentPath: componentPathStr,
                    component,
                    uid,
                    message: `embed_height values still in V3 format (${observation.legacyEmbedHeight.join(", ")})`,
                });
            }
        }

        const expectedBaseComponent = normalizedWrappers[component];
        if (expectedBaseComponent) {
            issues.push({
                componentPath: componentPathStr,
                component,
                uid,
                message: `Wrapper component still present: component=${component} (expected ${expectedBaseComponent})`,
            });
        }
    }

    return {
        ok: issues.length === 0,
        issueCount: issues.length,
        issues,
    };
};

const isMigrationValidationReport = (
    value: unknown,
): value is MigrationValidationReport => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const maybe = value as {
        ok?: unknown;
        issueCount?: unknown;
        issues?: unknown;
    };

    return (
        typeof maybe.ok === "boolean" &&
        typeof maybe.issueCount === "number" &&
        Array.isArray(maybe.issues)
    );
};

export const runPreparedMigrationValidator = ({
    validator,
    data,
    isDebug = false,
}: {
    validator: PreparedMigrationValidator;
    data: unknown;
    isDebug?: boolean;
}): MigrationValidationReport => {
    if (validator.validateData) {
        const result = validator.validateData({
            data,
            isDebug,
        });

        if (
            result &&
            typeof (result as PromiseLike<unknown>).then === "function"
        ) {
            throw new Error(
                `Validator '${validator.id}' returned a Promise from validateData. sb-mig requires synchronous validateData for in-memory pipeline execution.`,
            );
        }

        if (!isMigrationValidationReport(result)) {
            throw new Error(
                `Validator '${validator.id}' returned invalid report shape. Expected { ok, issueCount, issues[] }`,
            );
        }

        return result;
    }

    if (validator.ruleSet) {
        return validateRuleSetData({
            data,
            ruleSet: validator.ruleSet,
            isDebug,
        });
    }

    throw new Error(
        `Validator '${validator.id}' has neither ruleSet nor validateData.`,
    );
};
