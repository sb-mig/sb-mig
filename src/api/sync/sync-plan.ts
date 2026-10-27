/**
 * What a component or datasource sync would change, computed without IO.
 *
 * The planner compares the payload sb-mig is about to write (local schema,
 * resolvers already applied) with what the space holds now. It is the same
 * comparison for a dry-run and for a real run: a dry-run stops after it, a
 * real run writes and reports it.
 */

export type PlanAction = "create" | "update" | "unchanged";

export type PropertyChange = {
    property: string;
    from: unknown;
    to: unknown;
};

export type FieldChange = {
    field: string;
    change: "added" | "removed" | "changed";
    type?: string;
    /** Only for `changed`: which properties of the field differ. */
    properties?: PropertyChange[];
};

export type WhitelistChange = {
    field: string;
    added: string[];
    removed: string[];
    /**
     * Whether the whitelist is enforced, before and after: `restrict_components`
     * on a blocks field, `restrict_content_types` on a link field. A newly
     * restricted field narrows too.
     */
    restricted: { from: boolean; to: boolean };
};

export type PresetPlan = {
    name: string;
    action: "create" | "update" | "unchanged";
    /**
     * Only for `update` when the space's preset was read: where the JSON
     * differs, as paths (`image`, `preset.title.0.text`).
     */
    changedKeys?: string[];
};

export type ComponentPlan = {
    name: string;
    action: PlanAction;
    /** Component-level properties (`display_name`, `is_root`, the group, ...). */
    properties: PropertyChange[];
    fields: FieldChange[];
    whitelist: WhitelistChange[];
    presets?: PresetPlan[];
    /**
     * Under `--ssot`: the component exists in the space and the sync deletes
     * it and creates it again. `action` still says how the schema changes.
     */
    recreated?: boolean;
};

export type DestructiveKind =
    | "field-removed"
    | "likely-rename"
    | "type-changed"
    | "whitelist-narrowed"
    | "component-removed"
    | "group-removed";

export type DestructiveChange = {
    kind: DestructiveKind;
    /** Absent only for `group-removed`. */
    component?: string;
    /** For `group-removed`: the component group --ssot deletes. */
    group?: string;
    field?: string;
    /** For `type-changed`: the field type before and after. */
    from?: string;
    to?: string;
    /** For `likely-rename`: the added fields of the same type. */
    candidates?: string[];
    /** For `whitelist-narrowed`: the components no longer allowed. */
    removed?: string[];
    message: string;
};

export type DatasourceEntryPlan = {
    name: string;
    action: "create" | "update";
    value?: PropertyChange;
    dimensionValues?: PropertyChange[];
};

export type DatasourcePlan = {
    name: string;
    slug?: string;
    action: PlanAction;
    properties: PropertyChange[];
    dimensionsAdded: string[];
    /** Entries that would be created or updated. */
    entries: DatasourceEntryPlan[];
    unchangedEntries: number;
};

// Ids, timestamps and server bookkeeping are never part of what we sync.
const IGNORED_COMPONENT_PROPERTIES = new Set([
    "id",
    "name",
    "schema",
    "all_presets",
    "preset_id",
    "component_group_name",
    "component_group_uuid",
    "created_at",
    "updated_at",
    "space_id",
    "real_name",
    "internal_tags_list",
    "internal_tag_ids",
]);

const IGNORED_FIELD_PROPERTIES = new Set(["id", "component_whitelist"]);

// Layout-only fields hold no content, so removing one loses no data.
const LAYOUT_FIELD_TYPES = new Set(["tab", "section"]);

const isBlank = (value: unknown): boolean =>
    value === undefined ||
    value === null ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0);

export const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (typeof a !== "object") return false;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        return a.every((item, index) => deepEqual(item, b[index]));
    }

    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);

    for (const key of keys) {
        // An absent key and an undefined one serialise the same.
        if (!deepEqual(aRecord[key], bRecord[key])) return false;
    }

    return true;
};

/**
 * Remote objects carry server defaults (`required: false`, `description: ""`)
 * that a local schema rarely spells out. A property only one side has counts
 * as a change only when its value says something.
 */
const sameValue = (local: unknown, remote: unknown): boolean => {
    if (deepEqual(local, remote)) return true;
    return isBlank(local) && isBlank(remote);
};

// The space numbers every field; a schema that leaves `pos` out has no
// opinion about it, so a missing local `pos` is never a change.
const UNSET_MEANS_UNCHANGED = new Set(["pos"]);

const HTML_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

const decodeEntities = (text: string): string =>
    text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, code: string) => {
        if (code[0] === "#") {
            const point =
                code[1] === "x" || code[1] === "X"
                    ? parseInt(code.slice(2), 16)
                    : parseInt(code.slice(1), 10);
            return Number.isNaN(point) ? entity : String.fromCodePoint(point);
        }
        return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    });

/**
 * Storyblok does not hand a preview template back as it was written. Right
 * after a create, 68 Backpack 4.11.0 components read back with a different
 * `preview_tmpl`, and Backpack has exactly 68 templates with a `<span>` in
 * them: the space rewrites markup. What a reader needs to see change is
 * the template's logic and text, so both sides are compared with entities
 * decoded, without their tags and without whitespace: a dropped tag may
 * leave a space behind or not. A change to the markup or the spacing alone
 * is still written; the plan just does not list it.
 */
export const normalizePreviewTemplate = (value: unknown): unknown => {
    if (typeof value !== "string") return value;

    return decodeEntities(value)
        .replace(/<\/?[a-z][^<>]*>/gi, "")
        .replace(/\s+/g, "");
};

// Component properties the space rewrites: compared in a normalized form.
const COMPONENT_PROPERTY_NORMALIZERS: Record<
    string,
    (value: unknown) => unknown
> = {
    preview_tmpl: normalizePreviewTemplate,
};

const diffProperties = (
    local: Record<string, any>,
    remote: Record<string, any>,
    ignored: Set<string>,
    {
        localKeysOnly,
        normalizers = {},
    }: {
        localKeysOnly: boolean;
        normalizers?: Record<string, (value: unknown) => unknown>;
    },
): PropertyChange[] => {
    const keys = localKeysOnly
        ? Object.keys(local)
        : [...new Set([...Object.keys(local), ...Object.keys(remote)])];
    const normalized = (key: string, value: unknown) =>
        normalizers[key] ? normalizers[key](value) : value;

    return keys
        .filter((key) => !ignored.has(key))
        .filter((key) => !(UNSET_MEANS_UNCHANGED.has(key) && !(key in local)))
        .filter(
            (key) =>
                !sameValue(
                    normalized(key, local[key]),
                    normalized(key, remote[key]),
                ),
        )
        .sort()
        .map((key) => ({ property: key, from: remote[key], to: local[key] }));
};

const asStringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)) : [];

const diffWhitelist = (
    field: string,
    local: Record<string, any>,
    remote: Record<string, any>,
): WhitelistChange | undefined => {
    if (
        local.component_whitelist === undefined &&
        remote.component_whitelist === undefined
    ) {
        return undefined;
    }

    const localList = asStringList(local.component_whitelist);
    const remoteList = asStringList(remote.component_whitelist);
    const added = localList.filter((name) => !remoteList.includes(name));
    const removed = remoteList.filter((name) => !localList.includes(name));
    const enforced = (field: Record<string, any>) =>
        Boolean(field.restrict_components || field.restrict_content_types);
    const restricted = {
        from: enforced(remote),
        to: enforced(local),
    };

    if (
        added.length === 0 &&
        removed.length === 0 &&
        restricted.from === restricted.to
    ) {
        return undefined;
    }

    return { field, added, removed, restricted };
};

export type RemoteGroup = { uuid?: string | null; name?: string };

const groupNameOf = (
    uuid: unknown,
    remoteGroups: RemoteGroup[],
): string | null => {
    if (!uuid) return null;
    return remoteGroups.find((group) => group.uuid === uuid)?.name ?? null;
};

// The space numbers, dates and attaches every preset; none of it is synced.
const IGNORED_PRESET_PROPERTIES = new Set([
    "id",
    "component_id",
    "space_id",
    "created_at",
    "updated_at",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Where two pieces of preset content differ, as paths. A `_uid` only tells
 * one blok from another, and a key only one side has counts only when its
 * value says something (`sameValue`). A key or an array missing on one side
 * is one path, not one per value under it.
 */
const contentPaths = (
    local: unknown,
    remote: unknown,
    path: string,
): string[] => {
    if (isBlank(local) && isBlank(remote)) return [];

    if (isRecord(local) && isRecord(remote)) {
        const keys = [
            ...new Set([...Object.keys(local), ...Object.keys(remote)]),
        ].filter((key) => key !== "_uid");
        return keys.flatMap((key) =>
            contentPaths(local[key], remote[key], `${path}.${key}`),
        );
    }

    if (
        Array.isArray(local) &&
        Array.isArray(remote) &&
        local.length === remote.length
    ) {
        return local.flatMap((item, index) =>
            contentPaths(item, remote[index], `${path}.${index}`),
        );
    }

    return deepEqual(local, remote) ? [] : [path];
};

// `https://host/x.webp` and `//host/x.webp` are the same image.
const withoutProtocol = (value: unknown): unknown =>
    typeof value === "string" ? value.replace(/^https?:(?=\/\/)/i, "") : value;

/**
 * Where a local preset (what the sync writes: name, content, image) differs
 * from the one in the space. Only the local keys count: the space adds its
 * own (`color`, `icon`, `description`) to every preset.
 */
const presetChangedKeys = (local: any, remote: any): string[] =>
    Object.keys(local ?? {})
        .filter((key) => !IGNORED_PRESET_PROPERTIES.has(key))
        .sort()
        .flatMap((key) =>
            key === "image"
                ? sameValue(
                      withoutProtocol(local[key]),
                      withoutProtocol(remote[key]),
                  )
                    ? []
                    : [key]
                : contentPaths(local[key], remote[key], key),
        );

/** The preset itself: `all_presets` entries are `{ preset: { name, ... } }`. */
const presetBodyOf = (entry: any): any =>
    typeof entry?.preset?.name === "string" ? entry.preset : entry;

/**
 * Plan a component's presets. A preset the space has by name is compared
 * with `remotePresets`, the space's presets of this component with their
 * content; without them (not read) it can only be planned as an update.
 */
const presetPlanOf = (
    local: any,
    remote: any,
    remotePresets: any[] | undefined,
): PresetPlan[] | undefined => {
    if (!Array.isArray(local?.all_presets)) return undefined;

    const remoteNames = new Set(
        (Array.isArray(remote?.all_presets) ? remote.all_presets : []).map(
            (preset: any) => preset?.name ?? preset?.preset?.name,
        ),
    );

    return local.all_presets.map((entry: any): PresetPlan => {
        const body = presetBodyOf(entry);
        const name = String(body?.name ?? "unknown");
        if (!remoteNames.has(name)) return { name, action: "create" };

        const remotePreset = remotePresets?.find(
            (preset: any) => preset?.name === name,
        );
        if (!remotePreset) return { name, action: "update" };

        const changedKeys = presetChangedKeys(body, remotePreset);
        return changedKeys.length === 0
            ? { name, action: "unchanged" }
            : { name, action: "update", changedKeys };
    });
};

/**
 * Plan one component.
 *
 * `local` is the payload as it will be written (resolvers applied);
 * `remote` is the component in the space, or undefined when it is new.
 * The group is compared by name: a group that a dry-run would create has
 * no uuid yet, and a uuid says nothing to a reader anyway.
 */
export const planComponent = ({
    local,
    remote,
    remoteGroups = [],
    presets = false,
    remotePresets,
}: {
    local: any;
    remote?: any;
    remoteGroups?: RemoteGroup[];
    presets?: boolean;
    /** The space's presets of this component, content included. */
    remotePresets?: any[];
}): ComponentPlan => {
    const name = String(local?.name ?? "unknown");
    const presetPlan = presets
        ? presetPlanOf(local, remote, remotePresets)
        : undefined;
    const withPresets = (plan: ComponentPlan): ComponentPlan =>
        presetPlan ? { ...plan, presets: presetPlan } : plan;

    const localSchema: Record<string, any> = local?.schema ?? {};

    if (!remote) {
        return withPresets({
            name,
            action: "create",
            properties: [],
            fields: Object.keys(localSchema)
                .sort()
                .map((field) => ({
                    field,
                    change: "added" as const,
                    type: localSchema[field]?.type,
                })),
            whitelist: [],
        });
    }

    const remoteSchema: Record<string, any> = remote.schema ?? {};

    const properties = diffProperties(
        local,
        remote,
        IGNORED_COMPONENT_PROPERTIES,
        { localKeysOnly: true, normalizers: COMPONENT_PROPERTY_NORMALIZERS },
    );

    const localGroup = local.component_group_name ?? null;
    const remoteGroup = groupNameOf(remote.component_group_uuid, remoteGroups);
    if (localGroup !== remoteGroup) {
        properties.push({
            property: "component_group",
            from: remoteGroup,
            to: localGroup,
        });
    }

    const fields: FieldChange[] = [];
    const whitelist: WhitelistChange[] = [];
    const fieldNames = [
        ...new Set([...Object.keys(localSchema), ...Object.keys(remoteSchema)]),
    ].sort();

    for (const field of fieldNames) {
        const localField = localSchema[field];
        const remoteField = remoteSchema[field];

        if (localField && !remoteField) {
            fields.push({ field, change: "added", type: localField.type });
            continue;
        }

        if (!localField && remoteField) {
            fields.push({ field, change: "removed", type: remoteField.type });
            continue;
        }

        const changed = diffProperties(
            localField,
            remoteField,
            IGNORED_FIELD_PROPERTIES,
            { localKeysOnly: false },
        );
        if (changed.length > 0) {
            fields.push({
                field,
                change: "changed",
                type: localField.type,
                properties: changed,
            });
        }

        const whitelistChange = diffWhitelist(field, localField, remoteField);
        if (whitelistChange) whitelist.push(whitelistChange);
    }

    const isUnchanged =
        properties.length === 0 &&
        fields.length === 0 &&
        whitelist.length === 0;

    return withPresets({
        name,
        action: isUnchanged ? "unchanged" : "update",
        properties,
        fields,
        whitelist,
    });
};

/**
 * The changes that can lose content or break existing stories.
 *
 * A removed field orphans the data stored under it. When a field of the same
 * type is added in the same sync, the removal is most likely a rename, and
 * the stored data will not follow it. A whitelist is narrowed when it newly
 * restricts a field, or drops components it allowed before: existing stories
 * may already hold those bloks.
 */
export const detectDestructiveChanges = (
    plan: ComponentPlan,
): DestructiveChange[] => {
    const destructive: DestructiveChange[] = [];

    const added = plan.fields.filter((field) => field.change === "added");
    const removed = plan.fields.filter(
        (field) =>
            field.change === "removed" &&
            !LAYOUT_FIELD_TYPES.has(String(field.type)),
    );

    for (const field of removed) {
        const candidates = added
            .filter((addedField) => addedField.type === field.type)
            .map((addedField) => addedField.field);

        if (candidates.length > 0) {
            destructive.push({
                kind: "likely-rename",
                component: plan.name,
                field: field.field,
                candidates,
                message: `'${plan.name}.${field.field}' (${field.type}) is removed and ${candidates
                    .map((candidate) => `'${candidate}'`)
                    .join(
                        ", ",
                    )} of the same type is added: likely a rename. Content stored under '${field.field}' will not move to the new field.`,
            });
        } else {
            destructive.push({
                kind: "field-removed",
                component: plan.name,
                field: field.field,
                message: `'${plan.name}.${field.field}' (${field.type}) is removed. Content stored under it is no longer editable.`,
            });
        }
    }

    // Content stored under a field is shaped by its type: a textarea's
    // string is not a richtext document, an asset is not a multiasset.
    for (const field of plan.fields) {
        if (field.change !== "changed") continue;

        const type = field.properties?.find(
            (property) => property.property === "type",
        );
        if (!type) continue;

        const from = String(type.from);
        const to = String(type.to);
        if (LAYOUT_FIELD_TYPES.has(from) && LAYOUT_FIELD_TYPES.has(to)) {
            continue;
        }

        destructive.push({
            kind: "type-changed",
            component: plan.name,
            field: field.field,
            from,
            to,
            message: `'${plan.name}.${field.field}' changes type from ${from} to ${to}. Content stored under it may no longer fit the field.`,
        });
    }

    for (const change of plan.whitelist) {
        if (!change.restricted.to) continue;

        const newlyRestricted = !change.restricted.from;
        if (!newlyRestricted && change.removed.length === 0) continue;

        destructive.push({
            kind: "whitelist-narrowed",
            component: plan.name,
            field: change.field,
            removed: change.removed,
            message: newlyRestricted
                ? `'${plan.name}.${change.field}' becomes restricted to its component whitelist; bloks outside it that stories already hold stop being allowed.`
                : `'${plan.name}.${change.field}' no longer allows ${change.removed
                      .map((name) => `'${name}'`)
                      .join(", ")}.`,
        });
    }

    return destructive;
};

/** Under `--ssot` every remote component missing from code is deleted. */
export const detectSsotRemovals = (
    localNames: string[],
    remoteComponents: any[],
): DestructiveChange[] => {
    const local = new Set(localNames);

    return remoteComponents
        .map((component) => String(component?.name ?? "unknown"))
        .filter((name) => !local.has(name))
        .sort()
        .map((name) => ({
            kind: "component-removed" as const,
            component: name,
            message: `'${name}' exists only in the space and is deleted by --ssot.`,
        }));
};

/**
 * Under `--ssot` every group is deleted too. A group no local component uses
 * is not created again: it is gone, and so is every space-only component's
 * place in it.
 */
export const detectSsotGroupRemovals = (
    localGroupNames: string[],
    remoteGroups: any[],
): DestructiveChange[] => {
    const local = new Set(localGroupNames);

    return remoteGroups
        .map((group) => String(group?.name ?? "unknown"))
        .filter((name) => !local.has(name))
        .sort()
        .map((name) => ({
            kind: "group-removed" as const,
            group: name,
            message: `Component group '${name}' exists only in the space and is deleted by --ssot.`,
        }));
};

const dimensionNameOf = (dimension: any): string =>
    String(dimension?.name ?? "");

/**
 * Plan one datasource and its entries.
 *
 * sb-mig never deletes a datasource entry or a dimension, so nothing here is
 * destructive. `remoteDimensionValues` maps a dimension name to the
 * `entry name -> dimension value` pairs the space holds for it.
 */
export const planDatasource = ({
    local,
    remote,
    remoteEntries = [],
    remoteDimensionValues = {},
}: {
    local: any;
    remote?: any;
    remoteEntries?: any[];
    remoteDimensionValues?: Record<string, Record<string, unknown>>;
}): DatasourcePlan => {
    const name = String(local?.name ?? "unknown");
    const localEntries: any[] = Array.isArray(local?.datasource_entries)
        ? local.datasource_entries
        : [];
    const localDimensions: any[] = Array.isArray(local?.dimensions)
        ? local.dimensions
        : [];

    if (!remote) {
        return {
            name,
            slug: local?.slug,
            action: "create",
            properties: [],
            dimensionsAdded: localDimensions.map(dimensionNameOf),
            entries: localEntries.map((entry) => ({
                name: String(entry?.name ?? "unknown"),
                action: "create" as const,
            })),
            unchangedEntries: 0,
        };
    }

    const properties: PropertyChange[] = [];
    if (!sameValue(local.slug, remote.slug)) {
        properties.push({
            property: "slug",
            from: remote.slug,
            to: local.slug,
        });
    }

    const remoteDimensionNames = new Set(
        (Array.isArray(remote.dimensions) ? remote.dimensions : []).map(
            dimensionNameOf,
        ),
    );
    const dimensionsAdded = localDimensions
        .map(dimensionNameOf)
        .filter((dimension) => !remoteDimensionNames.has(dimension));

    const entries: DatasourceEntryPlan[] = [];
    let unchangedEntries = 0;

    for (const entry of localEntries) {
        const entryName = String(entry?.name ?? "unknown");
        const remoteEntry = remoteEntries.find(
            (candidate: any) => candidate?.name === entryName,
        );

        if (!remoteEntry) {
            entries.push({ name: entryName, action: "create" });
            continue;
        }

        const plan: DatasourceEntryPlan = { name: entryName, action: "update" };

        if (!sameValue(entry.value, remoteEntry.value)) {
            plan.value = {
                property: "value",
                from: remoteEntry.value,
                to: entry.value,
            };
        }

        const dimensionValues = Object.entries(
            (entry.dimension_values ?? {}) as Record<string, unknown>,
        )
            .filter(
                ([dimension, value]) =>
                    !sameValue(
                        value,
                        remoteDimensionValues[dimension]?.[entryName],
                    ),
            )
            .map(([dimension, value]) => ({
                property: dimension,
                from: remoteDimensionValues[dimension]?.[entryName],
                to: value,
            }));

        if (dimensionValues.length > 0) plan.dimensionValues = dimensionValues;

        if (plan.value || plan.dimensionValues) {
            entries.push(plan);
        } else {
            unchangedEntries++;
        }
    }

    const isUnchanged =
        properties.length === 0 &&
        dimensionsAdded.length === 0 &&
        entries.length === 0;

    return {
        name,
        slug: local.slug,
        action: isUnchanged ? "unchanged" : "update",
        properties,
        dimensionsAdded,
        entries,
        unchangedEntries,
    };
};
