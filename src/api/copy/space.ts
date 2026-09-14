/**
 * `copy space` — the pure half.
 *
 * Everything here is planning and payload shaping over plain objects read from
 * the two spaces, so every rule the rulings name (match by name, never delete,
 * strip generated ids, remap group uuids and preset component ids) can be tested
 * without a network. The orchestrator in `space-apply.ts` only reads, calls these
 * and writes.
 */

/** The five schema resources of v1, in the order they are written. */
export const COPY_SPACE_RESOURCES = [
    "languages",
    "groups",
    "components",
    "presets",
    "datasources",
] as const;

export type CopySpaceResource = (typeof COPY_SPACE_RESOURCES)[number];

export type CopySpaceLanguage = { code: string; name: string };

export type CopySpaceGroup = {
    id?: number;
    uuid: string;
    name: string;
    parent_id?: number | null;
    parent_uuid?: string | null;
};

export type CopySpaceComponent = Record<string, any> & {
    id?: number;
    name: string;
    component_group_uuid?: string | null;
    schema?: Record<string, any>;
};

export type CopySpacePreset = Record<string, any> & {
    id?: number;
    name: string;
    component_id: number;
    image?: string | null;
    icon?: string | null;
};

export type CopySpaceDimension = {
    id?: number;
    name: string;
    entry_value: string;
};

export type CopySpaceDatasource = {
    id?: number;
    name: string;
    slug: string;
    dimensions?: CopySpaceDimension[];
};

export type CopySpaceEntry = {
    id?: number;
    name: string;
    value: string;
    /** Dimension values keyed by dimension name, when read. */
    dimension_values?: Record<string, string | null>;
};

/**
 * `--only` accepts a comma list or a repeated flag. The result keeps the order
 * the resources are written in, whatever order they were typed in, because a
 * component written before its group cannot point at it.
 */
export const parseCopySpaceOnly = (
    values: string[],
): { resources: CopySpaceResource[]; error?: string } => {
    const requested = values
        .flatMap((value) => value.split(","))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

    if (requested.length === 0) {
        return { resources: [...COPY_SPACE_RESOURCES] };
    }

    const unknown = requested.filter(
        (value) => !COPY_SPACE_RESOURCES.includes(value as CopySpaceResource),
    );

    if (unknown.length > 0) {
        return {
            resources: [],
            error: `--only accepts ${COPY_SPACE_RESOURCES.join(", ")}. Unknown: ${unknown.join(", ")}.`,
        };
    }

    return {
        resources: COPY_SPACE_RESOURCES.filter((resource) =>
            requested.includes(resource),
        ),
    };
};

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

/**
 * Each group's full path, `Parent/Child`, keyed by its uuid. Nested groups of
 * the same name under different parents are different groups, so the path —
 * not the bare name — is what identifies a group across two spaces. A parent
 * that cannot be found ends the walk rather than looping.
 */
export const buildGroupPaths = (
    groups: CopySpaceGroup[],
): Map<string, string> => {
    const byUuid = new Map(groups.map((group) => [group.uuid, group]));
    const paths = new Map<string, string>();

    for (const group of groups) {
        const names: string[] = [];
        const seen = new Set<string>();
        let current: CopySpaceGroup | undefined = group;

        while (current && !seen.has(current.uuid)) {
            seen.add(current.uuid);
            names.unshift(current.name);
            current = current.parent_uuid
                ? byUuid.get(current.parent_uuid)
                : undefined;
        }

        paths.set(group.uuid, names.join("/"));
    }

    return paths;
};

/**
 * Parents before children, so that a child's `parent_id` can be looked up from
 * a group the run has already created. Stable within a depth.
 */
export const orderGroupsParentsFirst = (
    groups: CopySpaceGroup[],
): CopySpaceGroup[] => {
    const paths = buildGroupPaths(groups);
    const depth = (group: CopySpaceGroup) =>
        (paths.get(group.uuid) ?? group.name).split("/").length;

    return groups
        .map((group, index) => ({ group, index }))
        .sort(
            (left, right) =>
                depth(left.group) - depth(right.group) ||
                left.index - right.index,
        )
        .map(({ group }) => group);
};

export type CopySpaceGroupMap = {
    /** Source group uuid -> its full path. */
    sourcePathByUuid: Map<string, string>;
    /** Full path -> the target group living at that path. */
    targetByPath: Map<string, { id?: number; uuid: string }>;
};

/**
 * The bridge a component payload is rewritten through: source uuid -> path ->
 * target uuid. Storyblok cannot create a group with a chosen uuid, so a target
 * group of the same path always carries a different one.
 */
export const buildGroupNameMap = ({
    sourceGroups,
    targetGroups,
}: {
    sourceGroups: CopySpaceGroup[];
    targetGroups: CopySpaceGroup[];
}): CopySpaceGroupMap => {
    const targetPaths = buildGroupPaths(targetGroups);
    const targetByPath = new Map<string, { id?: number; uuid: string }>();

    for (const group of targetGroups) {
        const groupPath = targetPaths.get(group.uuid);

        if (groupPath) {
            targetByPath.set(groupPath, { id: group.id, uuid: group.uuid });
        }
    }

    return {
        sourcePathByUuid: buildGroupPaths(sourceGroups),
        targetByPath,
    };
};

const resolveTargetGroupUuid = (
    sourceUuid: string,
    groupMap: CopySpaceGroupMap,
): { uuid?: string; path?: string } => {
    const groupPath = groupMap.sourcePathByUuid.get(sourceUuid);

    if (!groupPath) {
        return {};
    }

    return {
        uuid: groupMap.targetByPath.get(groupPath)?.uuid,
        path: groupPath,
    };
};

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

/** Keys Storyblok generates per space, which a payload must not carry over. */
const COMPONENT_GENERATED_KEYS = [
    "id",
    "space_id",
    "created_at",
    "updated_at",
    "all_presets",
];

export type CopySpaceDroppedWhitelistGroup = {
    component: string;
    field: string;
    sourceGroupUuid: string;
    /** The group's path in the source, when the source knows it. */
    groupPath?: string;
};

export type CopySpaceComponentRemap = {
    payload: Record<string, any>;
    droppedWhitelistGroups: CopySpaceDroppedWhitelistGroup[];
    /** Set when the component's own group has no counterpart in the target. */
    missingGroup?: { sourceGroupUuid: string; groupPath?: string };
};

/**
 * One source component shaped for the target space: generated keys and every
 * generated `schema.<field>.id` dropped, its group and every whitelisted group
 * pointed at the target group of the same path. A whitelisted group with no
 * counterpart is dropped from the whitelist and reported — leaving a source uuid
 * in place would whitelist a group that does not exist.
 */
export const remapComponentForTarget = ({
    component,
    groupMap,
}: {
    component: CopySpaceComponent;
    groupMap: CopySpaceGroupMap;
}): CopySpaceComponentRemap => {
    const payload: Record<string, any> = {};

    for (const [key, value] of Object.entries(component)) {
        if (!COMPONENT_GENERATED_KEYS.includes(key)) {
            payload[key] = value;
        }
    }

    const droppedWhitelistGroups: CopySpaceDroppedWhitelistGroup[] = [];

    if (component.schema && typeof component.schema === "object") {
        const schema: Record<string, any> = {};

        for (const [fieldName, field] of Object.entries(component.schema)) {
            if (!field || typeof field !== "object" || Array.isArray(field)) {
                schema[fieldName] = field;
                continue;
            }

            const fieldWithoutId: Record<string, any> = { ...field };
            delete fieldWithoutId.id;

            if (Array.isArray(fieldWithoutId.component_group_whitelist)) {
                const remapped: string[] = [];

                for (const sourceUuid of fieldWithoutId.component_group_whitelist) {
                    const target = resolveTargetGroupUuid(
                        String(sourceUuid),
                        groupMap,
                    );

                    if (target.uuid) {
                        remapped.push(target.uuid);
                        continue;
                    }

                    droppedWhitelistGroups.push({
                        component: component.name,
                        field: fieldName,
                        sourceGroupUuid: String(sourceUuid),
                        ...(target.path ? { groupPath: target.path } : {}),
                    });
                }

                fieldWithoutId.component_group_whitelist = remapped;
            }

            schema[fieldName] = fieldWithoutId;
        }

        payload.schema = schema;
    }

    let missingGroup: CopySpaceComponentRemap["missingGroup"];

    if (component.component_group_uuid) {
        const target = resolveTargetGroupUuid(
            component.component_group_uuid,
            groupMap,
        );

        payload.component_group_uuid = target.uuid ?? null;

        if (!target.uuid) {
            missingGroup = {
                sourceGroupUuid: component.component_group_uuid,
                ...(target.path ? { groupPath: target.path } : {}),
            };
        }
    } else {
        payload.component_group_uuid = null;
    }

    return {
        payload,
        droppedWhitelistGroups,
        ...(missingGroup ? { missingGroup } : {}),
    };
};

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

const PRESET_GENERATED_KEYS = ["id", "space_id", "created_at", "updated_at"];

export type CopySpacePresetRemap = {
    componentName?: string;
    payload?: Record<string, any>;
    skipReason?: string;
    /** `image` / `icon` values copied as-is; they still point at the source space. */
    sourceAssetUrls: string[];
};

const isUrl = (value: unknown): value is string =>
    typeof value === "string" && /^(https?:)?\/\//.test(value);

/**
 * One source preset shaped for the target: its `component_id` is the id of the
 * target component with the same name. `image` and `icon` are left as-is by
 * ruling and returned so they can be reported — they are source-space URLs.
 */
export const remapPresetForTarget = ({
    preset,
    sourceComponentNameById,
    targetComponentIdByName,
}: {
    preset: CopySpacePreset;
    sourceComponentNameById: Map<number, string>;
    targetComponentIdByName: Map<string, number>;
}): CopySpacePresetRemap => {
    const sourceAssetUrls = [preset.image, preset.icon].filter(isUrl);
    const componentName = sourceComponentNameById.get(preset.component_id);

    if (!componentName) {
        return {
            sourceAssetUrls,
            skipReason: `its component (id ${preset.component_id}) is not in the source space`,
        };
    }

    const targetComponentId = targetComponentIdByName.get(componentName);

    if (targetComponentId === undefined) {
        return {
            componentName,
            sourceAssetUrls,
            skipReason: `component '${componentName}' does not exist in the target space`,
        };
    }

    const payload: Record<string, any> = {};

    for (const [key, value] of Object.entries(preset)) {
        if (!PRESET_GENERATED_KEYS.includes(key)) {
            payload[key] = value;
        }
    }

    payload.component_id = targetComponentId;

    return { componentName, payload, sourceAssetUrls };
};

/** Presets are matched by (component name, preset name), never by id. */
export const presetMatchKey = (componentName: string, presetName: string) =>
    JSON.stringify([componentName, presetName]);

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

/**
 * The language list the target is left with: every target language kept, every
 * source language added or renamed to the source's name. The space holds its
 * languages as one list written in one request, so writing the source list
 * alone would silently remove every target-only language — and v1 never
 * deletes.
 */
export const mergeLanguagesForTarget = ({
    source,
    target,
}: {
    source: CopySpaceLanguage[];
    target: CopySpaceLanguage[];
}): { languages: CopySpaceLanguage[]; add: string[]; update: string[] } => {
    const sourceByCode = new Map(
        source.map((language) => [language.code, language]),
    );
    const targetCodes = new Set(target.map((language) => language.code));
    const languages = target.map(
        (language) => sourceByCode.get(language.code) ?? language,
    );

    for (const language of source) {
        if (!targetCodes.has(language.code)) {
            languages.push(language);
        }
    }

    return {
        languages,
        add: source
            .filter((language) => !targetCodes.has(language.code))
            .map((language) => language.code),
        update: source
            .filter((language) => targetCodes.has(language.code))
            .map((language) => language.code),
    };
};

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export type CopySpaceSkip = { name: string; reason: string };

export type CopySpaceResourcePlan = {
    create: string[];
    update: string[];
    skip: CopySpaceSkip[];
};

export type CopySpaceSnapshot = {
    languages: CopySpaceLanguage[];
    defaultLangName?: string;
    groups: CopySpaceGroup[];
    components: CopySpaceComponent[];
    presets: CopySpacePreset[];
    datasources: CopySpaceDatasource[];
    /** Entries per datasource, keyed by datasource name. */
    entriesByDatasource: Map<string, CopySpaceEntry[]>;
};

export type CopySpacePlan = {
    schemaVersion: 1;
    command: "copy space";
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    languages?: { total: number; add: string[]; update: string[] };
    groups?: CopySpaceResourcePlan;
    components?: CopySpaceResourcePlan;
    presets?: CopySpaceResourcePlan;
    datasources?: CopySpaceResourcePlan;
    /** Entries named `<datasource>/<entry>`. */
    entries?: CopySpaceResourcePlan;
    droppedWhitelistGroups: CopySpaceDroppedWhitelistGroup[];
    presetsWithSourceAssetUrls: { preset: string; urls: string[] }[];
};

const emptyResourcePlan = (): CopySpaceResourcePlan => ({
    create: [],
    update: [],
    skip: [],
});

/**
 * What a run would do to the target, by name, before it does anything.
 * Resources the run itself creates are assumed present for the resources after
 * them — a component whitelisting a group the same run creates is not
 * "dropped". Nothing here ever plans a delete: a target-only resource is simply
 * not mentioned.
 */
export const buildCopySpacePlan = ({
    sourceSpaceId,
    targetSpaceId,
    resources,
    source,
    target,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    source: CopySpaceSnapshot;
    target: CopySpaceSnapshot;
}): CopySpacePlan => {
    const inScope = (resource: CopySpaceResource) =>
        resources.includes(resource);
    const plan: CopySpacePlan = {
        schemaVersion: 1,
        command: "copy space",
        sourceSpaceId,
        targetSpaceId,
        resources,
        droppedWhitelistGroups: [],
        presetsWithSourceAssetUrls: [],
    };

    if (inScope("languages")) {
        const merged = mergeLanguagesForTarget({
            source: source.languages,
            target: target.languages,
        });

        plan.languages = {
            total: source.languages.length,
            add: merged.add,
            update: merged.update,
        };
    }

    const sourceGroupPaths = buildGroupPaths(source.groups);
    const targetGroupPaths = new Set(buildGroupPaths(target.groups).values());

    if (inScope("groups")) {
        const groups = emptyResourcePlan();

        for (const group of orderGroupsParentsFirst(source.groups)) {
            const groupPath = sourceGroupPaths.get(group.uuid) ?? group.name;

            (targetGroupPaths.has(groupPath)
                ? groups.update
                : groups.create
            ).push(groupPath);
        }

        plan.groups = groups;
    }

    // The target as it will stand once the groups step has run, so a component
    // is only reported as losing a group the run will not create.
    const projectedTargetGroups: CopySpaceGroup[] = [...target.groups];

    if (inScope("groups")) {
        for (const group of source.groups) {
            const groupPath = sourceGroupPaths.get(group.uuid);

            if (groupPath && !targetGroupPaths.has(groupPath)) {
                projectedTargetGroups.push({
                    ...group,
                    uuid: `planned:${group.uuid}`,
                    parent_uuid: group.parent_uuid
                        ? `planned:${group.parent_uuid}`
                        : null,
                });
            }
        }
    }

    const groupMap = buildGroupNameMap({
        sourceGroups: source.groups,
        targetGroups: projectedTargetGroups,
    });
    const targetComponentNames = new Set(
        target.components.map((component) => component.name),
    );

    if (inScope("components")) {
        const components = emptyResourcePlan();

        for (const component of source.components) {
            (targetComponentNames.has(component.name)
                ? components.update
                : components.create
            ).push(component.name);

            plan.droppedWhitelistGroups.push(
                ...remapComponentForTarget({ component, groupMap })
                    .droppedWhitelistGroups,
            );
        }

        plan.components = components;
    }

    if (inScope("presets")) {
        const presets = emptyResourcePlan();
        const sourceComponentNameById = new Map(
            source.components.map((component) => [
                component.id as number,
                component.name,
            ]),
        );
        const targetComponentNameById = new Map(
            target.components.map((component) => [
                component.id as number,
                component.name,
            ]),
        );
        const projectedComponentIds = new Map<string, number>();

        for (const component of target.components) {
            projectedComponentIds.set(component.name, component.id as number);
        }

        if (inScope("components")) {
            source.components.forEach((component, index) => {
                if (!projectedComponentIds.has(component.name)) {
                    projectedComponentIds.set(component.name, -1 - index);
                }
            });
        }

        const targetPresetKeys = new Set(
            target.presets.map((preset) =>
                presetMatchKey(
                    targetComponentNameById.get(preset.component_id) ?? "",
                    preset.name,
                ),
            ),
        );

        for (const preset of source.presets) {
            const remap = remapPresetForTarget({
                preset,
                sourceComponentNameById,
                targetComponentIdByName: projectedComponentIds,
            });
            const label = `${remap.componentName ?? `component ${preset.component_id}`}/${preset.name}`;

            if (remap.sourceAssetUrls.length > 0) {
                plan.presetsWithSourceAssetUrls.push({
                    preset: label,
                    urls: remap.sourceAssetUrls,
                });
            }

            if (!remap.payload || !remap.componentName) {
                presets.skip.push({
                    name: label,
                    reason: remap.skipReason ?? "unresolvable component",
                });
                continue;
            }

            (targetPresetKeys.has(
                presetMatchKey(remap.componentName, preset.name),
            )
                ? presets.update
                : presets.create
            ).push(label);
        }

        plan.presets = presets;
    }

    if (inScope("datasources")) {
        const datasources = emptyResourcePlan();
        const entries = emptyResourcePlan();
        const targetDatasourceNames = new Set(
            target.datasources.map((datasource) => datasource.name),
        );

        for (const datasource of source.datasources) {
            const exists = targetDatasourceNames.has(datasource.name);

            (exists ? datasources.update : datasources.create).push(
                datasource.name,
            );

            const targetEntryNames = new Set(
                exists
                    ? (
                          target.entriesByDatasource.get(datasource.name) ?? []
                      ).map((entry) => entry.name)
                    : [],
            );

            for (const entry of source.entriesByDatasource.get(
                datasource.name,
            ) ?? []) {
                (targetEntryNames.has(entry.name)
                    ? entries.update
                    : entries.create
                ).push(`${datasource.name}/${entry.name}`);
            }
        }

        plan.datasources = datasources;
        plan.entries = entries;
    }

    return plan;
};
