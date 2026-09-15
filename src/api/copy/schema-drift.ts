/**
 * Pre-flight "schema drift" for `copy stories`: content whose shape no longer
 * matches the type its schema declares for the field.
 *
 * Storyblok checks a field's shape only when a story is saved. Content written
 * before a field's type changed (a text field turned into richtext, say) keeps
 * its old shape until something saves it again — and a copy is exactly that
 * save, so the target rejects it: `The value of the field content in the
 * component sb-blockquote must be a prosemirror document`.
 *
 * Pure: stories and schemas in, findings out. No network, no coercion.
 */

export type SchemaDriftFieldType =
    | "richtext"
    | "bloks"
    | "multilink"
    | "asset"
    | "multiasset";

export type SchemaDriftFinding = {
    sourceStoryId: number;
    sourceFullSlug: string;
    component: string;
    field: string;
    expected: SchemaDriftFieldType;
    /** The shape actually found: string, number, boolean, array or object. */
    got: string;
    /** Where in the story's content, e.g. `content.body[0].content`. */
    path: string;
    uid?: string;
};

export type SchemaDriftGroup = {
    component: string;
    field: string;
    expected: SchemaDriftFieldType;
    got: string;
    count: number;
};

export type SchemaDriftSummary = {
    occurrences: number;
    stories: number;
    /** Largest group first, then by `component.field`. */
    groups: SchemaDriftGroup[];
    storyFullSlugs: string[];
    findings: SchemaDriftFinding[];
};

/** Component name → its schema (field name → field definition). */
export type ComponentSchemas = Record<string, Record<string, any> | undefined>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The only field types this check covers, with the shape each must hold. A
 * field of any other type is not checked. An absent or null value is never
 * drift: there is nothing for the target to reject.
 */
const FIELD_SHAPE_CHECKS = new Map<
    SchemaDriftFieldType,
    (value: unknown) => boolean
>([
    [
        "richtext",
        (value) =>
            value === "" || (isPlainObject(value) && value.type === "doc"),
    ],
    ["bloks", (value) => Array.isArray(value)],
    ["multilink", (value) => isPlainObject(value)],
    ["asset", (value) => isPlainObject(value)],
    ["multiasset", (value) => Array.isArray(value)],
]);

const describeShape = (value: unknown): string =>
    Array.isArray(value) ? "array" : typeof value;

const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;

/**
 * Every field whose value has the wrong shape for its declared type, in every
 * blok of every story — bloks nested in bloks and in richtext included. Each
 * blok is read against the target schema, and against the source schema only
 * when the target does not have the component.
 */
export const findSchemaDrift = ({
    stories,
    targetSchemas,
    sourceSchemas = {},
}: {
    stories: any[];
    targetSchemas: ComponentSchemas;
    sourceSchemas?: ComponentSchemas;
}): SchemaDriftSummary => {
    const findings: SchemaDriftFinding[] = [];

    for (const story of stories) {
        if (!story) {
            continue;
        }

        const sourceStoryId = Number(story.id);
        const sourceFullSlug = String(story.full_slug ?? story.slug ?? "");

        const visit = (value: unknown, path: string) => {
            if (Array.isArray(value)) {
                value.forEach((item, index) =>
                    visit(item, `${path}[${index}]`),
                );
                return;
            }

            if (!isPlainObject(value)) {
                return;
            }

            const component =
                typeof value.component === "string"
                    ? value.component
                    : undefined;
            const schema = component
                ? (targetSchemas[component] ?? sourceSchemas[component])
                : undefined;

            if (component && isPlainObject(schema)) {
                for (const [field, definition] of Object.entries(schema)) {
                    const expected = (definition as any)?.type;
                    const check = FIELD_SHAPE_CHECKS.get(expected);
                    const fieldValue = value[field];

                    if (
                        !check ||
                        fieldValue === undefined ||
                        fieldValue === null ||
                        check(fieldValue)
                    ) {
                        continue;
                    }

                    findings.push({
                        sourceStoryId,
                        sourceFullSlug,
                        component,
                        field,
                        expected,
                        got: describeShape(fieldValue),
                        path: `${path}.${field}`,
                        ...(typeof value._uid === "string"
                            ? { uid: value._uid }
                            : {}),
                    });
                }
            }

            for (const [key, child] of Object.entries(value)) {
                if (key === "component" || key === "_uid") {
                    continue;
                }

                visit(child, `${path}.${key}`);
            }
        };

        visit(story.content, "content");
    }

    const groupsByKey = new Map<string, SchemaDriftGroup>();

    for (const finding of findings) {
        const key = JSON.stringify([
            finding.component,
            finding.field,
            finding.expected,
            finding.got,
        ]);
        const group = groupsByKey.get(key) ?? {
            component: finding.component,
            field: finding.field,
            expected: finding.expected,
            got: finding.got,
            count: 0,
        };

        group.count += 1;
        groupsByKey.set(key, group);
    }

    const label = (group: SchemaDriftGroup) =>
        `${group.component}.${group.field} ${group.got}`;
    const groups = [...groupsByKey.values()].sort((a, b) =>
        b.count !== a.count
            ? b.count - a.count
            : label(a) < label(b)
              ? -1
              : label(a) > label(b)
                ? 1
                : 0,
    );
    const storyFullSlugs = [
        ...new Set(findings.map((finding) => finding.sourceFullSlug)),
    ].sort();

    return {
        occurrences: findings.length,
        stories: storyFullSlugs.length,
        groups,
        storyFullSlugs,
        findings,
    };
};

/**
 * The PLAN line, always printed (zero included), then one indented line per
 * group: `sb-blockquote.content: expected richtext, got string (22)`.
 */
export const formatSchemaDriftLines = (
    summary: SchemaDriftSummary,
): string[] => [
    `schema drift: ${summary.occurrences} ${plural(summary.occurrences, "occurrence", "occurrences")} in ${summary.stories} ${plural(summary.stories, "story", "stories")}`,
    ...summary.groups.map(
        (group) =>
            `  ${group.component}.${group.field}: expected ${group.expected}, got ${group.got} (${group.count})`,
    ),
];

export type CopyStoriesWillFailSummary = {
    stories: number;
    storyFullSlugs: string[];
};

/**
 * Stories whose write the target will reject: schema drift only. Storyblok
 * saves a component it does not know and a component outside its field's
 * whitelist alike; the editor flags them, the write succeeds.
 */
export const summarizeStoriesWillFail = ({
    schemaDrift,
}: {
    schemaDrift: SchemaDriftSummary;
}): CopyStoriesWillFailSummary => ({
    stories: schemaDrift.stories,
    storyFullSlugs: [...schemaDrift.storyFullSlugs],
});

export const formatStoriesWillFailLine = (
    summary: CopyStoriesWillFailSummary,
): string =>
    `will fail: ${summary.stories} ${plural(summary.stories, "story", "stories")} (schema drift)`;
