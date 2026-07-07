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

const rewriteStoryLinkObject = (
    node: Record<string, any>,
    path: string,
    state: RewriteState,
) => {
    if (node.linktype !== "story") {
        return;
    }

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
