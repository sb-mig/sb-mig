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
        node.forEach((item, index) =>
            rewriteNode(item, `${path}[${index}]`, state),
        );
        return;
    }

    if (!isRecord(node)) {
        return;
    }

    rewriteAssetObject(node, path, state);
    rewriteStoryLinkObject(node, path, state);
    rewriteRichtextLinkObject(node, path, state);
    rewriteSchemaAwareOptions(node, path, state);

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
        if (
            RESERVED_CONTENT_KEYS.has(fieldName) ||
            !Array.isArray(fieldValue)
        ) {
            continue;
        }

        const fieldSchema = getFieldSchema(schema, fieldName);
        if (
            fieldSchema?.type !== "options" ||
            fieldSchema.source !== "internal_stories"
        ) {
            continue;
        }

        fieldValue.forEach((item, index) => {
            if (typeof item !== "number") {
                return;
            }

            const targetId = state.maps.storyIds.get(item);
            if (targetId === undefined) {
                return;
            }

            addRecord(state, {
                type: "story",
                path: `${path}.${fieldName}[${index}]`,
                sourceValue: item,
                targetValue: targetId,
                field: "id",
            });
            fieldValue[index] = targetId;
        });
    }
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
