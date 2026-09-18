import type {
    CopyComponentSchemaField,
    CopyComponentSchemaRegistry,
    CopyGraphAssetNode,
    CopyGraphAssetReference,
    CopyGraphOpaqueField,
    CopyGraphStoryReference,
    CopyReferenceScannerOptions,
    CopyReferenceScannerResult,
    CopyWarning,
} from "./types.js";

type StoryLike = {
    id?: number;
    uuid?: string;
    full_slug?: string;
    parent_id?: number | null;
    content?: Record<string, unknown>;
};

type StoryContext = {
    sourceStoryId?: number;
    sourceStoryUuid?: string;
    sourceStoryFullSlug?: string;
};

type ScannerState = {
    schemas: CopyComponentSchemaRegistry;
    options: Required<Pick<CopyReferenceScannerOptions, "referencePolicy">>;
    /** Strings are only scanned for URLs of this space; unset scans none. */
    sourceSpaceId?: string;
    /** Paths of `filename`s already recorded as an asset object. */
    assetObjectFilenamePaths: Set<string>;
    context: StoryContext;
    storyReferences: CopyGraphStoryReference[];
    assetReferences: CopyGraphAssetReference[];
    assetNodesByKey: Map<string, CopyGraphAssetNode>;
    opaqueFields: CopyGraphOpaqueField[];
    warnings: CopyWarning[];
    errors: CopyReferenceScannerResult["errors"];
    missingSchemas: Set<string>;
};

const RESERVED_CONTENT_KEYS = new Set(["_uid", "component", "_editable"]);

/* ------------------------------------------------------------------ *
 * Asset URLs inside strings
 * ------------------------------------------------------------------ */

/**
 * One asset URL, taken apart. The identity of an asset inside a string is its
 * PATH, never the whole URL: the asset library answers
 * `https://s3.amazonaws.com/a.storyblok.com/f/…` for a file whose own content
 * URL is `https://a.storyblok.com/f/…`, so comparing URLs as text matches
 * nothing. Everything after the file name (`/m/800x0`, a query, a fragment) is
 * the caller's to keep: it is display, not identity.
 */
export type CopyAssetUrlParts = {
    spaceId: string;
    dimensions: string;
    hash: string;
    name: string;
    /** `/f/<spaceId>/<dimensions>/<hash>/<name>` — the asset key. */
    key: string;
    /** Whatever follows the file name, as written. */
    rest: string;
};

export type CopyAssetUrlMatch = CopyAssetUrlParts & {
    /** The URL exactly as written, host form and tail included. */
    url: string;
    start: number;
    end: number;
    /** Where the key sits inside the scanned text, so only it is replaced. */
    keyStart: number;
    keyEnd: number;
};

// The host forms Storyblok writes: the CDN, the same CDN behind its S3 bucket
// path, a protocol-relative CDN URL, and the legacy image service. Between the
// host and `/f/` the image service may put its own segments
// (`/600x0/filters:format(webp)/f/…`): at most three, each bounded, so the
// scan of a text that repeats the host without ever reaching `/f/` stays
// linear. A `)` ends the file name so a markdown link does not swallow its own
// closing bracket, and the `d` flag gives the exact bounds of the key.
const ASSET_URL_ANCHORED =
    /^(?:https?:)?\/\/(?:s3\.amazonaws\.com\/)?(?:a|img2)\.storyblok\.com(?:\/[^/\s"'<>\\]{1,64}){0,3}\/f\/(\d+)\/([^/\s"'<>\\)]+)\/([^/\s"'<>\\)]+)\/([^/\s"'<>\\)?#]+)((?:\/m(?:\/[^\s"'<>\\)?#]*)?)?(?:\?[^\s"'<>\\)]*)?(?:#[^\s"'<>\\)]*)?)/d;

const ASSET_URL_GLOBAL = new RegExp(
    ASSET_URL_ANCHORED.source.replace(/^\^/, ""),
    "gd",
);

// `See https://a.storyblok.com/f/1/x/h/photo.png. Next` ends a sentence, not a
// file name: of 2,969 file names in a real library none ends in punctuation.
const SENTENCE_TAIL = /[.,;:!?]+$/;

const toAssetUrlMatch = (match: RegExpExecArray): CopyAssetUrlMatch => {
    // Groups 1-4 exist whenever the pattern matched at all.
    const spaceId = match[1] ?? "";
    const dimensions = match[2] ?? "";
    const hash = match[3] ?? "";
    const rawName = match[4] ?? "";
    const rest = match[5] ?? "";
    // Only when nothing follows the name: inside `?x=1.` the dot is the
    // query's, and the name already ended at the `?`.
    const trimmed =
        rest.length === 0 ? rawName.replace(SENTENCE_TAIL, "") : rawName;
    const name = trimmed.length > 0 ? trimmed : rawName;
    const dropped = (match[4] ?? "").length - name.length;
    const url = match[0].slice(0, match[0].length - dropped);
    // `d` gives the exact bounds of the file name and of the space id, so the
    // key can be replaced without rebuilding — or even reading — the host.
    const indices = match.indices as Array<[number, number] | undefined>;
    const keyStart = (indices[1]?.[0] ?? 0) - "/f/".length;
    const keyEnd = (indices[4]?.[1] ?? 0) - dropped;

    return {
        spaceId,
        dimensions,
        hash,
        name,
        key: `/f/${spaceId}/${dimensions}/${hash}/${name}`,
        rest,
        url,
        start: match.index,
        end: match.index + url.length,
        keyStart,
        keyEnd,
    };
};

/**
 * The asset key of a value that IS an asset URL (or starts with one).
 * `undefined` for anything else — a story URL, a relative path, a number.
 */
export const assetKeyOf = (value: unknown): CopyAssetUrlParts | undefined => {
    if (typeof value !== "string" || value.length === 0) {
        return undefined;
    }

    const match = ASSET_URL_ANCHORED.exec(value) as RegExpExecArray | null;

    if (!match) {
        return undefined;
    }

    const { spaceId, dimensions, hash, name, key, rest } =
        toAssetUrlMatch(match);

    return { spaceId, dimensions, hash, name, key, rest };
};

/** Every asset URL inside a longer text: HTML, markdown, a link field. */
export const findAssetUrls = (text: unknown): CopyAssetUrlMatch[] => {
    if (typeof text !== "string" || text.length === 0) {
        return [];
    }

    const matches: CopyAssetUrlMatch[] = [];

    ASSET_URL_GLOBAL.lastIndex = 0;

    let match = ASSET_URL_GLOBAL.exec(text) as RegExpExecArray | null;

    while (match) {
        matches.push(toAssetUrlMatch(match));
        match = ASSET_URL_GLOBAL.exec(text) as RegExpExecArray | null;
    }

    return matches;
};

export const scanStoryReferences = ({
    story,
    schemas,
    options = {},
}: {
    story: StoryLike;
    schemas: CopyComponentSchemaRegistry;
    options?: CopyReferenceScannerOptions;
}): CopyReferenceScannerResult => {
    const state: ScannerState = {
        schemas,
        options: {
            referencePolicy: options.referencePolicy ?? "preserve",
        },
        ...(options.sourceSpaceId
            ? { sourceSpaceId: options.sourceSpaceId }
            : {}),
        assetObjectFilenamePaths: new Set<string>(),
        context: {
            sourceStoryId: story.id,
            sourceStoryUuid: story.uuid,
            sourceStoryFullSlug: story.full_slug,
        },
        storyReferences: [],
        assetReferences: [],
        assetNodesByKey: new Map(),
        opaqueFields: [],
        warnings: [],
        errors: [],
        missingSchemas: new Set(),
    };

    scanStoryMetadata(story, state);
    scanComponentNode(story.content, "content", state);
    // Schema-blind, and deliberately last: an asset URL is just as real inside
    // a link, an SEO string, a plugin object or a component whose schema this
    // run never saw. The schema-aware pass goes first so an asset object's own
    // `filename` is recorded as the object it is, not twice.
    scanStringAssetUrls(story.content, "content", state);

    return {
        storyReferences: state.storyReferences,
        assetReferences: state.assetReferences,
        assetNodes: Array.from(state.assetNodesByKey.values()),
        opaqueFields: state.opaqueFields,
        warnings: state.warnings,
        errors: state.errors,
        missingSchemas: Array.from(state.missingSchemas),
    };
};

export const scanStoriesReferences = ({
    stories,
    schemas,
    options = {},
}: {
    stories: StoryLike[];
    schemas: CopyComponentSchemaRegistry;
    options?: CopyReferenceScannerOptions;
}): CopyReferenceScannerResult => {
    const combined: CopyReferenceScannerResult = {
        storyReferences: [],
        assetReferences: [],
        assetNodes: [],
        opaqueFields: [],
        warnings: [],
        errors: [],
        missingSchemas: [],
    };
    const assetNodesByKey = new Map<string, CopyGraphAssetNode>();
    const missingSchemas = new Set<string>();

    stories.forEach((story, index) => {
        const result = scanStoryReferences({ story, schemas, options });
        combined.storyReferences.push(...result.storyReferences);
        combined.assetReferences.push(...result.assetReferences);
        combined.opaqueFields.push(...result.opaqueFields);
        combined.warnings.push(...result.warnings);
        combined.errors.push(...result.errors);

        for (const schemaName of result.missingSchemas) {
            missingSchemas.add(schemaName);
        }

        for (const assetNode of result.assetNodes) {
            assetNodesByKey.set(getAssetNodeKey(assetNode), assetNode);
        }

        const scanned = index + 1;
        if (
            options.onProgress &&
            (scanned === stories.length ||
                scanned % 10 === 0 ||
                stories.length <= 10)
        ) {
            options.onProgress({
                scanned,
                total: stories.length,
                storyFullSlug: story.full_slug,
            });
        }
    });

    combined.assetNodes = Array.from(assetNodesByKey.values());
    combined.missingSchemas = Array.from(missingSchemas);

    return combined;
};

const scanStoryMetadata = (story: StoryLike, state: ScannerState) => {
    // parent_id 0 is Storyblok's "lives at the space root" sentinel, not a
    // story id. Recording it inflated every reference count with a phantom.
    if (typeof story.parent_id === "number" && story.parent_id !== 0) {
        addStoryReference(state, {
            path: "parent_id",
            referencedStoryId: story.parent_id,
        });
    }

    // `alternates` is read-only API metadata that the copy payload strips
    // before writing, so it is never rewritten and never dangles. Scanning it
    // would report references that no copy phase acts on.
};

const scanComponentNode = (
    node: unknown,
    path: string,
    state: ScannerState,
) => {
    if (!isRecord(node)) {
        return;
    }

    const component = node.component;
    if (typeof component !== "string" || component.length === 0) {
        return;
    }

    const schema = state.schemas[component];
    if (!schema) {
        state.missingSchemas.add(component);
        state.warnings.push({
            code: "missing_component_schema",
            message: `Component schema '${component}' was not found. References inside this component were not scanned.`,
            path,
        });
        state.opaqueFields.push({
            type: "opaque_field",
            ...state.context,
            component,
            field: component,
            path,
            reason: "unknown_schema",
        });
        return;
    }

    for (const [fieldName, fieldValue] of Object.entries(node)) {
        if (RESERVED_CONTENT_KEYS.has(fieldName)) {
            continue;
        }

        const normalizedFieldName = normalizeFieldName(fieldName);
        const fieldSchema = schema[normalizedFieldName];
        const fieldPath = `${path}.${fieldName}`;

        if (!fieldSchema) {
            addOpaqueField(state, {
                component,
                field: normalizedFieldName,
                path: fieldPath,
                reason: "unsupported_field",
            });
            continue;
        }

        if (typeof fieldSchema.plugin === "string") {
            addOpaqueField(state, {
                component,
                field: normalizedFieldName,
                fieldType: fieldSchema.type,
                plugin: fieldSchema.plugin,
                path: fieldPath,
                reason: "plugin_field",
            });
        }

        scanField({
            component,
            fieldName: normalizedFieldName,
            fieldValue,
            fieldSchema,
            path: fieldPath,
            state,
        });
    }
};

const scanField = ({
    fieldValue,
    fieldSchema,
    path,
    state,
}: {
    component: string;
    fieldName: string;
    fieldValue: unknown;
    fieldSchema: CopyComponentSchemaField;
    path: string;
    state: ScannerState;
}) => {
    switch (fieldSchema.type) {
        case "asset":
            scanAssetField(fieldValue, path, state);
            return;
        case "multiasset":
            scanMultiassetField(fieldValue, path, state);
            return;
        case "multilink":
            scanMultilinkField(fieldValue, path, state);
            return;
        case "options":
            scanOptionsField(fieldValue, fieldSchema, path, state);
            return;
        case "option":
            scanOptionField(fieldValue, fieldSchema, path, state);
            return;
        case "bloks":
            scanBloksField(fieldValue, path, state);
            return;
        case "richtext":
            scanRichtextField(fieldValue, path, state);
            return;
        default:
            return;
    }
};

const scanAssetField = (
    fieldValue: unknown,
    path: string,
    state: ScannerState,
) => {
    if (!isRecord(fieldValue)) {
        return;
    }

    const assetId =
        typeof fieldValue.id === "number" ? fieldValue.id : undefined;
    const filename =
        typeof fieldValue.filename === "string"
            ? fieldValue.filename
            : undefined;

    if (assetId === undefined && !filename) {
        return;
    }

    const reference: CopyGraphAssetReference = {
        type: "asset_reference",
        ...state.context,
        assetId,
        filename,
        ...(assetKeyOf(filename)
            ? { assetKey: assetKeyOf(filename)?.key }
            : {}),
        shape: "object",
        path,
        status: "planned",
    };

    state.assetReferences.push(reference);
    state.assetObjectFilenamePaths.add(`${path}.filename`);

    if (assetId !== undefined && filename) {
        const node: CopyGraphAssetNode = {
            type: "asset",
            sourceId: assetId,
            sourceFilename: filename,
            action: "unknown",
        };
        state.assetNodesByKey.set(getAssetNodeKey(node), node);
    }
};

const scanMultiassetField = (
    fieldValue: unknown,
    path: string,
    state: ScannerState,
) => {
    if (!Array.isArray(fieldValue)) {
        state.warnings.push({
            code: "invalid_multiasset_field",
            message: "Expected multiasset field to be an array.",
            path,
            sourceValue: fieldValue,
        });
        return;
    }

    fieldValue.forEach((asset, index) =>
        scanAssetField(asset, `${path}[${index}]`, state),
    );
};

const scanMultilinkField = (
    fieldValue: unknown,
    path: string,
    state: ScannerState,
) => {
    if (!isRecord(fieldValue) || fieldValue.linktype !== "story") {
        return;
    }

    if (typeof fieldValue.id === "number") {
        addStoryReference(state, {
            path: `${path}.id`,
            referencedStoryId: fieldValue.id,
        });
        return;
    }

    if (typeof fieldValue.id === "string" && isUuidLike(fieldValue.id)) {
        addStoryReference(state, {
            path: `${path}.id`,
            referencedStoryUuid: fieldValue.id,
        });
    }
};

const scanOptionsField = (
    fieldValue: unknown,
    fieldSchema: CopyComponentSchemaField,
    path: string,
    state: ScannerState,
) => {
    if (fieldSchema.source !== "internal_stories") {
        return;
    }

    if (!Array.isArray(fieldValue)) {
        return;
    }

    fieldValue.forEach((value, index) => {
        if (typeof value === "number") {
            addStoryReference(state, {
                path: `${path}[${index}]`,
                referencedStoryId: value,
            });
            return;
        }

        if (typeof value === "string" && isUuidLike(value)) {
            addStoryReference(state, {
                path: `${path}[${index}]`,
                referencedStoryUuid: value,
            });
        }
    });
};

const scanOptionField = (
    fieldValue: unknown,
    fieldSchema: CopyComponentSchemaField,
    path: string,
    state: ScannerState,
) => {
    if (fieldSchema.source !== "internal_stories") {
        return;
    }

    if (typeof fieldValue === "number") {
        addStoryReference(state, {
            path,
            referencedStoryId: fieldValue,
        });
        return;
    }

    if (typeof fieldValue === "string" && isUuidLike(fieldValue)) {
        addStoryReference(state, {
            path,
            referencedStoryUuid: fieldValue,
        });
    }
};

const scanBloksField = (
    fieldValue: unknown,
    path: string,
    state: ScannerState,
) => {
    if (!Array.isArray(fieldValue)) {
        state.warnings.push({
            code: "invalid_bloks_field",
            message: "Expected bloks field to be an array.",
            path,
            sourceValue: fieldValue,
        });
        return;
    }

    fieldValue.forEach((blok, index) =>
        scanComponentNode(blok, `${path}[${index}]`, state),
    );
};

const scanRichtextField = (
    fieldValue: unknown,
    path: string,
    state: ScannerState,
) => {
    scanRichtextNode(fieldValue, path, state);
};

const scanRichtextNode = (node: unknown, path: string, state: ScannerState) => {
    if (Array.isArray(node)) {
        node.forEach((item, index) =>
            scanRichtextNode(item, `${path}[${index}]`, state),
        );
        return;
    }

    if (!isRecord(node)) {
        return;
    }

    if (node.type === "link" && isRecord(node.attrs)) {
        const attrs = node.attrs;
        if (attrs.linktype === "story" && typeof attrs.uuid === "string") {
            addStoryReference(state, {
                path: `${path}.attrs.uuid`,
                referencedStoryUuid: attrs.uuid,
            });
        }
    }

    if (node.type === "blok" && isRecord(node.attrs)) {
        const body = node.attrs.body;
        if (Array.isArray(body)) {
            body.forEach((blok, index) =>
                scanComponentNode(blok, `${path}.attrs.body[${index}]`, state),
            );
        }
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === "attrs" && (node.type === "link" || node.type === "blok")) {
            continue;
        }

        scanRichtextNode(value, `${path}.${key}`, state);
    }
};

const addStoryReference = (
    state: ScannerState,
    reference: Pick<
        CopyGraphStoryReference,
        "path" | "referencedStoryId" | "referencedStoryUuid"
    >,
) => {
    state.storyReferences.push({
        type: "story_reference",
        ...state.context,
        ...reference,
        // The scanner sees one story at a time, so it cannot know whether the
        // referenced story is inside the copy plan. The classifier decides
        // that; see classifyStoryReferences in ./reference-classifier.ts.
        status:
            state.options.referencePolicy === "preserve"
                ? "unclassified"
                : "unresolved",
    });
};

const addOpaqueField = (
    state: ScannerState,
    field: Omit<
        CopyGraphOpaqueField,
        "type" | "sourceStoryId" | "sourceStoryUuid" | "sourceStoryFullSlug"
    >,
) => {
    state.opaqueFields.push({
        type: "opaque_field",
        ...state.context,
        ...field,
    });

    state.warnings.push({
        code: field.reason,
        message: `Field '${field.component}.${field.field}' may contain references that cannot be safely scanned yet.`,
        path: field.path,
    });
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string): boolean => UUID_PATTERN.test(value);

const normalizeFieldName = (fieldName: string): string =>
    fieldName.replace(/__i18n__.*/, "");

const getAssetNodeKey = (asset: CopyGraphAssetNode): string =>
    `${asset.sourceId}:${asset.sourceFilename}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* ------------------------------------------------------------------ *
 * The shared string walk
 * ------------------------------------------------------------------ */

export type CopyStringVisit = {
    value: string;
    path: string;
    /** Writes a new value back where the string was found. */
    replace: (next: string) => void;
};

/**
 * Every string of a story's content, at any depth and under any key — the
 * `__i18n__` copies of a field, a plugin's own object, a richtext node's
 * `attrs` however deeply nested, a component with no schema.
 *
 * The scanner and the rewriter BOTH walk through this one function. That is
 * the point: a PLAN that counts a reference the rewrite cannot reach is the
 * lie this whole feature exists to remove, and two walks kept in step by hand
 * drift apart. `skipPaths` is the only asymmetry either side may ask for, and
 * both use it for the same thing — the `filename` of an asset object, which is
 * handled as the object it belongs to.
 */
export const walkCopyStrings = ({
    value,
    path,
    skipPaths,
    visit,
}: {
    value: unknown;
    path: string;
    skipPaths?: ReadonlySet<string>;
    visit: (found: CopyStringVisit) => void;
}): void => {
    if (typeof value === "string") {
        if (!skipPaths?.has(path)) {
            visit({ value, path, replace: () => undefined });
        }

        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            const itemPath = `${path}[${index}]`;

            if (typeof item === "string") {
                if (skipPaths?.has(itemPath)) {
                    return;
                }

                visit({
                    value: item,
                    path: itemPath,
                    replace: (next) => {
                        value[index] = next;
                    },
                });
                return;
            }

            walkCopyStrings({ value: item, path: itemPath, skipPaths, visit });
        });
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    for (const [key, entry] of Object.entries(value)) {
        if (RESERVED_CONTENT_KEYS.has(key)) {
            continue;
        }

        const entryPath = `${path}.${key}`;

        if (typeof entry === "string") {
            if (skipPaths?.has(entryPath)) {
                continue;
            }

            visit({
                value: entry,
                path: entryPath,
                replace: (next) => {
                    value[key] = next;
                },
            });
            continue;
        }

        walkCopyStrings({ value: entry, path: entryPath, skipPaths, visit });
    }
};

/**
 * The scanner's half of the shared walk: every asset URL of the source space
 * found in a string becomes a reference. A URL of another space is recorded
 * nowhere — the foreign-space report reads asset OBJECTS only, and a foreign
 * URL in a text is not something this copy can act on.
 */
const scanStringAssetUrls = (
    node: unknown,
    path: string,
    state: ScannerState,
) => {
    if (state.sourceSpaceId === undefined) {
        return;
    }

    walkCopyStrings({
        value: node,
        path,
        skipPaths: state.assetObjectFilenamePaths,
        visit: ({ value, path: stringPath }) => {
            for (const match of findAssetUrls(value)) {
                if (match.spaceId !== state.sourceSpaceId) {
                    continue;
                }

                state.assetReferences.push({
                    type: "asset_reference",
                    ...state.context,
                    filename: match.url,
                    assetKey: match.key,
                    shape: "string",
                    path: stringPath,
                    status: "planned",
                });
            }
        },
    });
};
