import type {
    CopyComponentSchema,
    CopyComponentSchemaRegistry,
    CopyMaps,
    CopyRewriteRecord,
    CopyRewriteResult,
    CopyWarning,
} from "./types.js";

type RewriteState = {
    maps: CopyMaps;
    schemas?: CopyComponentSchemaRegistry;
    records: CopyRewriteRecord[];
    warnings: CopyWarning[];
};

const RESERVED_CONTENT_KEYS = new Set(["_uid", "component", "_editable"]);

export const rewriteCopyReferences = <T>({
    value,
    maps,
    schemas,
}: {
    value: T;
    maps: CopyMaps;
    schemas?: CopyComponentSchemaRegistry;
}): CopyRewriteResult<T> => {
    const clonedValue = cloneJson(value);
    const state: RewriteState = {
        maps,
        schemas,
        records: [],
        warnings: [],
    };

    rewriteNode(clonedValue, "$", state);

    return {
        value: clonedValue,
        records: state.records,
        warnings: state.warnings,
    };
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const rewriteNode = (node: unknown, path: string, state: RewriteState) => {
    if (Array.isArray(node)) {
        node.forEach((item, index) => {
            if (typeof item === "string") {
                rewriteBareStoryUuid(
                    node,
                    index,
                    item,
                    `${path}[${index}]`,
                    state,
                );
                return;
            }

            rewriteNode(item, `${path}[${index}]`, state);
        });
        return;
    }

    if (!isRecord(node)) {
        return;
    }

    rewriteAssetObject(node, path, state);
    rewriteStoryLinkObject(node, path, state);
    rewriteRichtextLinkObject(node, path, state);
    rewriteSchemaAwareOptions(node, path, state);
    rewriteBareStoryUuidValues(node, path, state);

    if (
        node.type === "blok" &&
        isRecord(node.attrs) &&
        Array.isArray(node.attrs.body)
    ) {
        node.attrs.body.forEach((blok, index) =>
            rewriteNode(blok, `${path}.attrs.body[${index}]`, state),
        );
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === "attrs" && (node.type === "link" || node.type === "blok")) {
            continue;
        }

        rewriteNode(value, `${path}.${key}`, state);
    }
};

const rewriteAssetObject = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    const hasAssetShape =
        typeof node.filename === "string" &&
        (typeof node.id === "number" ||
            state.maps.assetFilenames.has(node.filename));

    if (!hasAssetShape) {
        return;
    }

    const targetById =
        typeof node.id === "number"
            ? state.maps.assetIds.get(node.id)
            : undefined;
    const targetFilename =
        targetById?.filename ?? state.maps.assetFilenames.get(node.filename);

    if (typeof node.id === "number" && targetById) {
        addRecord(state, {
            type: "asset",
            path: `${path}.id`,
            sourceValue: node.id,
            targetValue: targetById.id,
            field: "id",
        });
        node.id = targetById.id;
    }

    if (targetFilename && node.filename !== targetFilename) {
        addRecord(state, {
            type: "asset",
            path: `${path}.filename`,
            sourceValue: node.filename,
            targetValue: targetFilename,
            field: "filename",
        });
        node.filename = targetFilename;
    }
};

/** The path keys a story link stores alongside its uuid. */
const STORY_LINK_PATH_KEYS = ["cached_url", "url", "href"];

/** The keys of the story object some links cache next to the link itself. */
const CACHED_STORY_PATH_KEYS = ["full_slug", "url"];

/**
 * Splits a stored link path into the story path and the `?query` / `#anchor`
 * tail, which belongs to the link rather than the story and must survive the
 * rewrite untouched.
 */
const splitStoryLinkPath = (value: string) => {
    const boundary = value.search(/[?#]/);

    return boundary === -1
        ? { linkPath: value, suffix: "" }
        : { linkPath: value.slice(0, boundary), suffix: value.slice(boundary) };
};

/** Keeps whatever leading and trailing slash convention the space stores. */
const applyTargetFullSlug = (linkPath: string, targetFullSlug: string) => {
    const leading = linkPath.startsWith("/") ? "/" : "";
    const trailing = linkPath.length > 1 && linkPath.endsWith("/") ? "/" : "";

    return `${leading}${targetFullSlug}${trailing}`;
};

/**
 * Rewrites one stored path of a relinked story link. A link whose target path
 * is unknown is left exactly as it is: a wrong path is worse than a stale one,
 * and the classifier has already reported what could not be mapped.
 */
const rewriteStoryLinkPath = ({
    node,
    key,
    path,
    state,
    targetFullSlug,
}: {
    node: Record<string, any>;
    key: string;
    path: string;
    state: RewriteState;
    targetFullSlug?: string;
}) => {
    const value = node[key];

    if (typeof value !== "string" || value.length === 0) {
        return;
    }

    // Some spaces store the uuid in the path slot (richtext `href` does it by
    // default). A value the story map knows is a reference, not a path, and it
    // maps as one.
    const targetUuid = state.maps.storyUuids.get(value);

    if (targetUuid !== undefined) {
        if (targetUuid !== value) {
            addRecord(state, {
                type: "story",
                path: `${path}.${key}`,
                sourceValue: value,
                targetValue: targetUuid,
                field: "uuid",
            });
            node[key] = targetUuid;
        }

        return;
    }

    // A value the maps already know as a story reference is a uuid sitting in
    // a path slot that an earlier pass has ALREADY relinked (`storyFullSlugs`
    // is keyed by the target uuid too). Treating it as a path would overwrite
    // the reference with a slug on the second pass, so the rewrite has to stop
    // here to stay idempotent.
    if (state.maps.storyFullSlugs.has(value)) {
        return;
    }

    if (targetFullSlug === undefined) {
        return;
    }

    const { linkPath, suffix } = splitStoryLinkPath(value);

    if (linkPath.length === 0) {
        return;
    }

    const rewritten = `${applyTargetFullSlug(linkPath, targetFullSlug)}${suffix}`;

    if (rewritten === value) {
        return;
    }

    addRecord(state, {
        type: "story",
        path: `${path}.${key}`,
        sourceValue: value,
        targetValue: rewritten,
        field: "path",
    });
    node[key] = rewritten;
};

/**
 * The target `full_slug` of the story a link points at, read from whichever of
 * its reference slots the maps recognise. Both key spaces are consulted: a
 * multilink stores either a uuid or a numeric story id, and either one has to
 * be able to repair the stored path beside it.
 */
const findTargetFullSlug = (values: unknown[], state: RewriteState) => {
    for (const value of values) {
        const targetFullSlug =
            typeof value === "string"
                ? state.maps.storyFullSlugs.get(value)
                : typeof value === "number"
                  ? state.maps.storyIdFullSlugs.get(value)
                  : undefined;

        if (targetFullSlug !== undefined) {
            return targetFullSlug;
        }
    }

    return undefined;
};

const rewriteStoryLinkObject = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    if (node.linktype !== "story") {
        return;
    }

    // Read before the id/uuid slots are rewritten: the target path is looked up
    // by the SOURCE reference the link still carries — which is a uuid in most
    // links and a numeric story id in some.
    const targetFullSlug = findTargetFullSlug([node.id, node.uuid], state);

    if (typeof node.id === "number") {
        const targetId = state.maps.storyIds.get(node.id);
        if (targetId !== undefined) {
            addRecord(state, {
                type: "story",
                path: `${path}.id`,
                sourceValue: node.id,
                targetValue: targetId,
                field: "id",
            });
            node.id = targetId;
        }
    }

    if (typeof node.id === "string") {
        const targetUuid = state.maps.storyUuids.get(node.id);
        if (targetUuid !== undefined) {
            addRecord(state, {
                type: "story",
                path: `${path}.id`,
                sourceValue: node.id,
                targetValue: targetUuid,
                field: "id",
            });
            node.id = targetUuid;
        }
    }

    if (typeof node.uuid === "string") {
        const targetUuid = state.maps.storyUuids.get(node.uuid);
        if (targetUuid !== undefined) {
            addRecord(state, {
                type: "story",
                path: `${path}.uuid`,
                sourceValue: node.uuid,
                targetValue: targetUuid,
                field: "uuid",
            });
            node.uuid = targetUuid;
        }
    }

    // A relinked link still renders through its stored path, so a correct uuid
    // with the source's path is a link that points at the right story and
    // navigates to the wrong one.
    for (const key of STORY_LINK_PATH_KEYS) {
        rewriteStoryLinkPath({ node, key, path, state, targetFullSlug });
    }

    if (isRecord(node.story)) {
        for (const key of CACHED_STORY_PATH_KEYS) {
            rewriteStoryLinkPath({
                node: node.story,
                key,
                path: `${path}.story`,
                state,
                targetFullSlug,
            });
        }
    }
};

const rewriteRichtextLinkObject = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    if (node.type !== "link" || !isRecord(node.attrs)) {
        return;
    }

    rewriteStoryLinkObject(node.attrs, `${path}.attrs`, state);
};

const rewriteSchemaAwareOptions = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    if (!state.schemas || typeof node.component !== "string") {
        return;
    }

    const schema = state.schemas[node.component];
    if (!schema) {
        return;
    }

    for (const [fieldName, fieldValue] of Object.entries(node)) {
        if (RESERVED_CONTENT_KEYS.has(fieldName)) {
            continue;
        }

        const fieldSchema = getFieldSchema(schema, fieldName);
        if (fieldSchema?.source !== "internal_stories") {
            continue;
        }

        if (fieldSchema.type === "options" && Array.isArray(fieldValue)) {
            fieldValue.forEach((item, index) => {
                rewriteStoryOptionItem(
                    fieldValue,
                    index,
                    item,
                    `${path}.${fieldName}[${index}]`,
                    state,
                );
            });
            continue;
        }

        if (fieldSchema.type === "option") {
            rewriteStoryOptionItem(
                node,
                fieldName,
                fieldValue,
                `${path}.${fieldName}`,
                state,
            );
        }
    }
};

const rewriteStoryOptionItem = (
    container: Record<string, any> | unknown[],
    key: string | number,
    item: unknown,
    path: string,
    state: RewriteState,
) => {
    if (typeof item === "number") {
        const targetId = state.maps.storyIds.get(item);
        if (targetId === undefined) {
            return;
        }

        addRecord(state, {
            type: "story",
            path,
            sourceValue: item,
            targetValue: targetId,
            field: "id",
        });
        (container as any)[key] = targetId;
        return;
    }

    if (typeof item === "string") {
        const targetUuid = state.maps.storyUuids.get(item);
        if (targetUuid === undefined) {
            return;
        }

        addRecord(state, {
            type: "story",
            path,
            sourceValue: item,
            targetValue: targetUuid,
            field: "uuid",
        });
        (container as any)[key] = targetUuid;
    }
};

// Safety net: any string value that is a key in storyUuids is a known
// copied-story source uuid (block _uids, space ids and story ids live in other
// namespaces), so rewriting exact matches is safe and covers custom plugin
// fields and shared-selector.shared_component without schema knowledge.
const rewriteBareStoryUuidValues = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    for (const [key, value] of Object.entries(node)) {
        if (RESERVED_CONTENT_KEYS.has(key) || typeof value !== "string") {
            continue;
        }

        rewriteBareStoryUuid(node, key, value, `${path}.${key}`, state);
    }
};

const rewriteBareStoryUuid = (
    container: Record<string, any> | unknown[],
    key: string | number,
    value: string,
    path: string,
    state: RewriteState,
) => {
    const targetUuid = state.maps.storyUuids.get(value);
    if (targetUuid === undefined) {
        return;
    }

    addRecord(state, {
        type: "story",
        path,
        sourceValue: value,
        targetValue: targetUuid,
        field: "uuid",
    });
    (container as any)[key] = targetUuid;
};

const getFieldSchema = (schema: CopyComponentSchema, fieldName: string) =>
    schema[fieldName] ?? schema[normalizeFieldName(fieldName)];

const normalizeFieldName = (fieldName: string): string =>
    fieldName.replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) =>
        char.toUpperCase(),
    );

const addRecord = (state: RewriteState, record: CopyRewriteRecord) => {
    state.records.push(record);
};

const isRecord = (value: unknown): value is Record<string, any> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
