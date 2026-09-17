/**
 * `copy space` — the pure half.
 *
 * Everything here is planning and payload shaping over plain objects read from
 * the two spaces, so every rule the rulings name (match by name, never delete,
 * strip generated ids, remap group uuids and preset component ids) can be tested
 * without a network. The orchestrator in `space-apply.ts` only reads, calls these
 * and writes.
 */

/**
 * The resources `copy space` copies, in the order they are written. `settings`
 * (internationalization switches and Visual Editor preview URLs) sits on the
 * space itself, right after the languages.
 */
export const COPY_SPACE_RESOURCES = [
    "languages",
    "settings",
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
 * Settings
 * ------------------------------------------------------------------ */

/**
 * The space settings `copy space` copies, in the order the PLAN lists them. A
 * closed allowlist: nothing else on the space object (tokens, hooks, plan,
 * owner) ever reaches a write.
 */
export const COPY_SPACE_SETTINGS_FIELDS = [
    "use_translated_stories",
    "show_stories_alternative_versions",
    "hide_flag_icons",
    "flag_icons_display_mode",
    "domain",
    "environments",
    "encode_preview_urls",
] as const;

export type CopySpaceSettingsField =
    (typeof COPY_SPACE_SETTINGS_FIELDS)[number];

/** A Visual Editor preview URL. */
export type CopySpaceEnvironment = { name: string; location: string };

/** Raw values, as read from a space. Never printed or written to a report. */
export type CopySpaceSettings = {
    use_translated_stories?: boolean;
    show_stories_alternative_versions?: boolean;
    hide_flag_icons?: boolean;
    flag_icons_display_mode?: string;
    domain?: string;
    environments?: CopySpaceEnvironment[];
    encode_preview_urls?: boolean;
};

export type CopySpaceSettingOutcome = "change" | "same" | "kept";

/** Preview URLs as the PLAN states them: how many, and their names only. */
export type CopySpaceEnvironmentsSummary = { count: number; names: string[] };

/**
 * One field as the PLAN states it. `domain` is redacted and `environments` is
 * counted and named, so a plan can be printed and written to a report.
 */
export type CopySpaceSettingsFieldPlan = {
    field: CopySpaceSettingsField;
    outcome: CopySpaceSettingOutcome;
    source?: string | boolean | CopySpaceEnvironmentsSummary;
    target?: string | boolean | CopySpaceEnvironmentsSummary;
    /**
     * `environments` only: the target's list after the merge, by name. The
     * names the source adds, and the target names whose preview URL it
     * replaces.
     */
    merge?: { count: number; added: string[]; updated: string[] };
};

export type CopySpaceSettingsPlan = {
    change: number;
    same: number;
    kept: number;
    fields: CopySpaceSettingsFieldPlan[];
};

/**
 * Flags that switch a capability on. A copy turns one on when the source has
 * it, and never turns off one the target already has.
 */
const CAPABILITY_FLAGS = new Set<CopySpaceSettingsField>([
    "use_translated_stories",
    "show_stories_alternative_versions",
]);

/** Storyblok answers `null` for a setting that was never set: that is absent. */
const isPresent = (value: unknown): boolean =>
    value !== undefined && value !== null;

/**
 * The seven settings of a Management API space object: each read top-level
 * first, then from `space.options`, the way languages are. A field absent in
 * both (`undefined` or `null`) is left out, so no later step can write or
 * report a `null`.
 */
export const pickCopySpaceSettings = (space: any): CopySpaceSettings => {
    const settings: Record<string, unknown> = {};

    for (const field of COPY_SPACE_SETTINGS_FIELDS) {
        const value = isPresent(space?.[field])
            ? space[field]
            : space?.options?.[field];

        if (isPresent(value)) {
            settings[field] = value;
        }
    }

    return settings as CopySpaceSettings;
};

/**
 * A URL safe to print: its origin, and nothing after it. A secret can sit in
 * the path, the query string or the fragment, so a URL with anything past its
 * origin is printed as `origin/…`. Anything that does not parse as a URL with
 * an origin is hidden entirely, because it cannot be told apart from a secret.
 */
export const redactUrl = (value: string): string => {
    try {
        const url = new URL(value);

        if (url.origin === "null") {
            return "<redacted>";
        }

        const onlyOrigin =
            (url.pathname === "" || url.pathname === "/") &&
            url.search === "" &&
            url.hash === "" &&
            url.username === "" &&
            url.password === "";

        return onlyOrigin ? url.origin : `${url.origin}/…`;
    } catch {
        return "<redacted>";
    }
};

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;

/** An environments list reduced to `{ name, location }`, in its own order. */
const normaliseEnvironments = (value: unknown): CopySpaceEnvironment[] =>
    Array.isArray(value)
        ? value.map((environment: any) => ({
              name: String(environment?.name ?? ""),
              location: String(environment?.location ?? ""),
          }))
        : [];

const sameEnvironments = (
    left: CopySpaceEnvironment[],
    right: CopySpaceEnvironment[],
): boolean =>
    left.length === right.length &&
    left.every(
        (environment, index) =>
            environment.name === right[index]?.name &&
            environment.location === right[index]?.location,
    );

/**
 * The target's preview URLs after a copy, merged by name the way languages
 * are: the target's order is kept, a source entry replaces the target entry of
 * the same name, new names are appended in the source's order, and target-only
 * names stay. `copy space` never deletes a preview URL.
 */
export const mergeEnvironmentsForTarget = ({
    source,
    target,
}: {
    source: unknown;
    target: unknown;
}): {
    environments: CopySpaceEnvironment[];
    added: string[];
    updated: string[];
} => {
    const sourceEnvironments = normaliseEnvironments(source);
    const targetEnvironments = normaliseEnvironments(target);
    // On a repeated name the last source entry wins, as a later write would.
    const sourceByName = new Map(
        sourceEnvironments.map((environment) => [
            environment.name,
            environment,
        ]),
    );
    const targetNames = new Set(
        targetEnvironments.map((environment) => environment.name),
    );
    const updated = new Set<string>();
    const environments = targetEnvironments.map((environment) => {
        const replacement = sourceByName.get(environment.name);

        if (!replacement) {
            return environment;
        }

        if (replacement.location !== environment.location) {
            updated.add(environment.name);
        }

        return replacement;
    });
    const added: string[] = [];

    for (const [name, environment] of sourceByName) {
        if (!targetNames.has(name)) {
            environments.push(environment);
            added.push(name);
        }
    }

    return { environments, added, updated: [...updated] };
};

const settingOutcome = (
    field: CopySpaceSettingsField,
    source: CopySpaceSettings,
    target: CopySpaceSettings,
): CopySpaceSettingOutcome => {
    const sourceValue = source[field];
    const targetValue = target[field];

    if (CAPABILITY_FLAGS.has(field)) {
        if (sourceValue === true && targetValue !== true) {
            return "change";
        }

        return targetValue === true && sourceValue !== true ? "kept" : "same";
    }

    if (field === "domain") {
        if (isNonEmptyString(sourceValue)) {
            return sourceValue === targetValue ? "same" : "change";
        }

        return isNonEmptyString(targetValue) ? "kept" : "same";
    }

    if (field === "environments") {
        // Merged by name, so the target never loses a preview URL: an empty
        // source leaves the list as it is, and there is nothing to keep.
        const merged = mergeEnvironmentsForTarget({
            source: sourceValue,
            target: targetValue,
        });

        return sameEnvironments(
            merged.environments,
            normaliseEnvironments(targetValue),
        )
            ? "same"
            : "change";
    }

    if (!isPresent(sourceValue)) {
        return "same";
    }

    return sourceValue === targetValue ? "same" : "change";
};

const displaySetting = (
    field: CopySpaceSettingsField,
    value: unknown,
): CopySpaceSettingsFieldPlan["source"] => {
    if (field === "domain") {
        return isNonEmptyString(value) ? redactUrl(value) : undefined;
    }

    if (field === "environments") {
        const environments = normaliseEnvironments(value);

        return {
            count: environments.length,
            names: environments.map((environment) => environment.name),
        };
    }

    return typeof value === "boolean" || typeof value === "string"
        ? value
        : undefined;
};

/**
 * What a copy would do to each setting: `change` (written), `same` (nothing to
 * do) or `kept` (the target keeps what it has). Printable: URLs are redacted
 * and preview URLs are reduced to their names.
 */
export const planCopySpaceSettings = ({
    source,
    target,
}: {
    source: CopySpaceSettings;
    target: CopySpaceSettings;
}): CopySpaceSettingsPlan => {
    const fields = COPY_SPACE_SETTINGS_FIELDS.map((field) => {
        const sourceDisplay = displaySetting(field, source[field]);
        const targetDisplay = displaySetting(field, target[field]);

        const merge =
            field === "environments"
                ? mergeEnvironmentsForTarget({
                      source: source.environments,
                      target: target.environments,
                  })
                : undefined;

        return {
            field,
            outcome: settingOutcome(field, source, target),
            ...(sourceDisplay !== undefined ? { source: sourceDisplay } : {}),
            ...(targetDisplay !== undefined ? { target: targetDisplay } : {}),
            ...(merge
                ? {
                      merge: {
                          count: merge.environments.length,
                          added: merge.added,
                          updated: merge.updated,
                      },
                  }
                : {}),
        };
    });
    const count = (outcome: CopySpaceSettingOutcome) =>
        fields.filter((entry) => entry.outcome === outcome).length;

    return {
        change: count("change"),
        same: count("same"),
        kept: count("kept"),
        fields,
    };
};

/**
 * The body of the settings write: only the fields whose outcome is `change`,
 * with the source's raw values. Environments carry the merged list, so the
 * target's own preview URLs are written back with it. Each entry holds only
 * `name` and `location`. Empty when nothing changes.
 */
export const buildCopySpaceSettingsBody = ({
    source,
    target,
}: {
    source: CopySpaceSettings;
    target: CopySpaceSettings;
}): CopySpaceSettings => {
    const body: Record<string, unknown> = {};

    for (const field of COPY_SPACE_SETTINGS_FIELDS) {
        if (settingOutcome(field, source, target) !== "change") {
            continue;
        }

        body[field] =
            field === "environments"
                ? mergeEnvironmentsForTarget({
                      source: source.environments,
                      target: target.environments,
                  }).environments
                : source[field];
    }

    return body as CopySpaceSettings;
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
    // Its default preset, by the source's own preset id. Restored after the
    // presets step, against the target's preset of the same name.
    "preset_id",
    // Tag ids are space-scoped; internal tags are not copied in v1.
    "internal_tag_ids",
    "internal_tags_list",
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

export const hasInternalTags = (component: CopySpaceComponent): boolean =>
    (Array.isArray(component.internal_tag_ids) &&
        component.internal_tag_ids.length > 0) ||
    (Array.isArray(component.internal_tags_list) &&
        component.internal_tags_list.length > 0);

export type CopySpaceDefaultPresetRestore = {
    /** The component whose `preset_id` is restored. */
    componentName: string;
    /** The preset it points at, identified the way presets are matched. */
    presetComponentName: string;
    presetName: string;
};

/**
 * Which components' default presets a run can point at the target's own preset.
 * `preset_id` is never copied as-is — it is a source preset id — so it is
 * restored after the presets step, and only when this run writes both the
 * component and its preset. Otherwise the target keeps its own default preset.
 */
export const planDefaultPresetRestores = ({
    source,
    resources,
}: {
    source: CopySpaceSnapshot;
    resources: CopySpaceResource[];
}): {
    restore: CopySpaceDefaultPresetRestore[];
    notRestorable: CopySpaceSkip[];
} => {
    const restore: CopySpaceDefaultPresetRestore[] = [];
    const notRestorable: CopySpaceSkip[] = [];
    const sourceComponentNameById = new Map(
        source.components.map((component) => [
            component.id as number,
            component.name,
        ]),
    );

    for (const component of source.components) {
        if (component.preset_id === undefined || component.preset_id === null) {
            continue;
        }

        if (
            !resources.includes("components") ||
            !resources.includes("presets")
        ) {
            notRestorable.push({
                name: component.name,
                reason: `${resources.includes("components") ? "presets" : "components"} are not copied in this run, so the target keeps its own default preset`,
            });
            continue;
        }

        const preset = source.presets.find(
            (item) => item.id === component.preset_id,
        );

        if (!preset) {
            notRestorable.push({
                name: component.name,
                reason: `its default preset (id ${component.preset_id}) is not in the source space`,
            });
            continue;
        }

        const presetComponentName = sourceComponentNameById.get(
            preset.component_id,
        );

        if (!presetComponentName) {
            notRestorable.push({
                name: component.name,
                reason: `its default preset '${preset.name}' belongs to a component that is not in the source space`,
            });
            continue;
        }

        restore.push({
            componentName: component.name,
            presetComponentName,
            presetName: preset.name,
        });
    }

    return { restore, notRestorable };
};

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
    /** The raw settings, read only when `settings` is in scope. Never printed. */
    settings?: CopySpaceSettings;
};

export type CopySpacePlan = {
    schemaVersion: 1;
    command: "copy space";
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    languages?: { total: number; add: string[]; update: string[] };
    /** What happens to each setting. Redacted: safe to print and to report. */
    settings?: CopySpaceSettingsPlan;
    groups?: CopySpaceResourcePlan;
    components?: CopySpaceResourcePlan;
    presets?: CopySpaceResourcePlan;
    datasources?: CopySpaceResourcePlan;
    /** Entries named `<datasource>/<entry>`. */
    entries?: CopySpaceResourcePlan;
    droppedWhitelistGroups: CopySpaceDroppedWhitelistGroup[];
    presetsWithSourceAssetUrls: { preset: string; urls: string[] }[];
    /** Components whose `image` still points at the source space (kept, reported). */
    componentsWithSourceImageUrls: string[];
    /** Components carrying internal tags, which v1 does not copy. */
    componentsWithInternalTags: number;
    /** Components whose default preset a run restores, and those it cannot. */
    defaultPresets?: { restore: string[]; notRestorable: CopySpaceSkip[] };
    /**
     * Field-type plugins the source components in scope use, and what the
     * target has. Absent when components are not copied or none uses one.
     */
    fieldTypePlugins?: CopySpaceFieldTypePluginsPlan;
    /**
     * Per datasource, the entries whose name Storyblok rejects on write. They
     * are planned as skips. Absent when datasources are not copied.
     */
    entriesStoryblokWillReject?: CopySpaceRejectedEntryNames[];
};

/* ------------------------------------------------------------------ *
 * Entry names Storyblok rejects
 * ------------------------------------------------------------------ */

export type CopySpaceRejectedEntryNames = {
    datasource: string;
    count: number;
    /** Every source entry of that datasource, so the count reads "n of total". */
    total: number;
    names: string[];
};

export const ENTRY_NAME_STORYBLOK_REJECTS_REASON =
    "name starts with a character Storyblok rejects (-, =, @)";

/**
 * Storyblok answers a datasource entry created with such a name with `The
 * following characters are not allowed at the beginning of name: -, =, @`.
 * Entries that already carry one are kept by Storyblok, but cannot be written
 * again through the Management API.
 */
export const isEntryNameStoryblokRejects = (name: string): boolean =>
    /^[-=@]/.test(name);

/* ------------------------------------------------------------------ *
 * Field-type plugins
 * ------------------------------------------------------------------ */

/** A plugin a `type: "custom"` field names, and the components using it. */
export type CopySpaceFieldTypePlugin = { name: string; components: string[] };

/**
 * What the run could learn about the target's field-type plugins. Storyblok
 * lists them account-wide (`GET /v1/field_types`), each with the `space_ids`
 * it is assigned to, and only for token types that endpoint supports.
 */
export type CopySpaceFieldTypeAvailability =
    | { readable: true; assigned: string[] }
    | { readable: false; status?: number; message: string };

export type CopySpaceFieldTypePluginsPlan = {
    used: CopySpaceFieldTypePlugin[];
    target: CopySpaceFieldTypeAvailability;
    /** Plugins the readable target lacks. Always empty when it was not readable. */
    missing: CopySpaceFieldTypePlugin[];
};

const compareNames = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every `schema.<field>.type === "custom"` → `field_type`, with the components
 * that use it. Most-used plugin first.
 */
export const collectFieldTypePlugins = (
    components: CopySpaceComponent[],
): CopySpaceFieldTypePlugin[] => {
    const componentsByPlugin = new Map<string, Set<string>>();

    for (const component of components) {
        const schema = component.schema;

        if (!schema || typeof schema !== "object") {
            continue;
        }

        for (const field of Object.values(schema) as any[]) {
            if (field?.type !== "custom") {
                continue;
            }

            const pluginName = field?.field_type;

            if (typeof pluginName !== "string" || pluginName.length === 0) {
                continue;
            }

            const users = componentsByPlugin.get(pluginName) ?? new Set();

            users.add(component.name);
            componentsByPlugin.set(pluginName, users);
        }
    }

    return [...componentsByPlugin.entries()]
        .map(([name, users]) => ({
            name,
            components: [...users].sort(compareNames),
        }))
        .sort(
            (a, b) =>
                b.components.length - a.components.length ||
                compareNames(a.name, b.name),
        );
};

export const planFieldTypePlugins = ({
    used,
    target,
}: {
    used: CopySpaceFieldTypePlugin[];
    target: CopySpaceFieldTypeAvailability;
}): CopySpaceFieldTypePluginsPlan => {
    const assigned = target.readable ? new Set(target.assigned) : undefined;

    return {
        used,
        target,
        missing: assigned
            ? used.filter((plugin) => !assigned.has(plugin.name))
            : [],
    };
};

const MISSING_PLUGINS_PATTERN =
    /field-type plugin\(s\) are not available in this space: ([^".]+)/;

/**
 * The plugin names in Storyblok's rejection, `The following field-type
 * plugin(s) are not available in this space: a, b. Install …`, or undefined
 * when the message is about something else.
 */
export const parseMissingFieldTypePlugins = (
    message: string,
): string[] | undefined => {
    const match = MISSING_PLUGINS_PATTERN.exec(message);
    const names = (match?.[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

    return names.length > 0 ? names : undefined;
};

export type CopySpaceMissingPluginGroups = {
    /** Components rejected because a plugin is not assigned to the target. */
    components: number;
    /** Per plugin, how many of those components named it. Most first. */
    plugins: { name: string; components: number }[];
};

export const groupMissingPluginFailures = (
    failures: { resource: string; name: string; message: string }[],
): CopySpaceMissingPluginGroups => {
    const componentsByPlugin = new Map<string, number>();
    let components = 0;

    for (const failure of failures) {
        const names =
            failure.resource === "components"
                ? parseMissingFieldTypePlugins(failure.message)
                : undefined;

        if (!names) {
            continue;
        }

        components += 1;

        for (const name of new Set(names)) {
            componentsByPlugin.set(
                name,
                (componentsByPlugin.get(name) ?? 0) + 1,
            );
        }
    }

    return {
        components,
        plugins: [...componentsByPlugin.entries()]
            .map(([name, count]) => ({ name, components: count }))
            .sort(
                (a, b) =>
                    b.components - a.components || compareNames(a.name, b.name),
            ),
    };
};

/** `components not written: 3 — missing plugins: seo-metatags (3), …` */
export const formatMissingPluginFailures = (
    groups: CopySpaceMissingPluginGroups,
): string =>
    `components not written: ${groups.components} — missing plugins: ${groups.plugins
        .map((plugin) => `${plugin.name} (${plugin.components})`)
        .join(", ")}`;

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
    targetFieldTypes,
}: {
    sourceSpaceId: string;
    targetSpaceId: string;
    resources: CopySpaceResource[];
    source: CopySpaceSnapshot;
    target: CopySpaceSnapshot;
    /** Undefined when the run did not read them: planned as not readable. */
    targetFieldTypes?: CopySpaceFieldTypeAvailability;
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
        componentsWithSourceImageUrls: [],
        componentsWithInternalTags: 0,
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

    if (inScope("settings")) {
        // Redacted by construction: the raw values stay in the snapshots.
        plan.settings = planCopySpaceSettings({
            source: source.settings ?? {},
            target: target.settings ?? {},
        });
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
        const targetUuidByPath = new Map(
            [...buildGroupPaths(target.groups).entries()].map(
                ([uuid, groupPath]) => [groupPath, uuid],
            ),
        );

        for (const group of source.groups) {
            const groupPath = sourceGroupPaths.get(group.uuid);

            if (groupPath && !targetGroupPaths.has(groupPath)) {
                const parentPath = group.parent_uuid
                    ? sourceGroupPaths.get(group.parent_uuid)
                    : undefined;

                projectedTargetGroups.push({
                    ...group,
                    uuid: `planned:${group.uuid}`,
                    // A new child under a parent the target already has hangs
                    // off that parent's real uuid; only a parent the run also
                    // creates is itself planned.
                    parent_uuid: group.parent_uuid
                        ? ((parentPath && targetUuidByPath.get(parentPath)) ??
                          `planned:${group.parent_uuid}`)
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

            if (isUrl(component.image)) {
                plan.componentsWithSourceImageUrls.push(component.name);
            }

            if (hasInternalTags(component)) {
                plan.componentsWithInternalTags += 1;
            }
        }

        plan.components = components;

        const defaultPresets = planDefaultPresetRestores({ source, resources });

        plan.defaultPresets = {
            restore: defaultPresets.restore.map((item) => item.componentName),
            notRestorable: defaultPresets.notRestorable,
        };

        const usedPlugins = collectFieldTypePlugins(source.components);

        if (usedPlugins.length > 0) {
            plan.fieldTypePlugins = planFieldTypePlugins({
                used: usedPlugins,
                target: targetFieldTypes ?? {
                    readable: false,
                    message: "the target's field-type plugins were not read",
                },
            });
        }
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
        const entriesStoryblokWillReject: CopySpaceRejectedEntryNames[] = [];
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
            const sourceEntries =
                source.entriesByDatasource.get(datasource.name) ?? [];
            const rejectedNames: string[] = [];

            for (const entry of sourceEntries) {
                const label = `${datasource.name}/${entry.name}`;

                // Planned as a skip and never written. Never renamed either:
                // the plugin reading this datasource looks entries up by name.
                if (isEntryNameStoryblokRejects(entry.name)) {
                    entries.skip.push({
                        name: label,
                        reason: ENTRY_NAME_STORYBLOK_REJECTS_REASON,
                    });
                    rejectedNames.push(entry.name);
                    continue;
                }

                (targetEntryNames.has(entry.name)
                    ? entries.update
                    : entries.create
                ).push(label);
            }

            if (rejectedNames.length > 0) {
                entriesStoryblokWillReject.push({
                    datasource: datasource.name,
                    count: rejectedNames.length,
                    total: sourceEntries.length,
                    names: rejectedNames,
                });
            }
        }

        plan.datasources = datasources;
        plan.entries = entries;
        plan.entriesStoryblokWillReject = entriesStoryblokWillReject;
    }

    return plan;
};
