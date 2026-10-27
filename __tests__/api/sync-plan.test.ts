import { describe, expect, it } from "vitest";

import {
    detectDestructiveChanges,
    detectSsotGroupRemovals,
    detectSsotRemovals,
    normalizePreviewTemplate,
    planComponent,
    planDatasource,
} from "../../src/api/sync/sync-plan.js";

const remoteHero = {
    id: 1,
    name: "hero",
    display_name: "Hero",
    is_nestable: true,
    component_group_uuid: "uuid-content",
    created_at: "2026-01-01",
    all_presets: [{ id: 9, name: "Default" }],
    schema: {
        title: { type: "text", pos: 0, required: false, description: "" },
        subtitle: { type: "text", pos: 1 },
        items: {
            type: "bloks",
            pos: 2,
            restrict_components: true,
            component_whitelist: ["card", "banner"],
        },
    },
};

const groups = [{ uuid: "uuid-content", name: "Content" }];

describe("planComponent", () => {
    it("plans a component missing from the space as a create with every field added", () => {
        const plan = planComponent({
            local: {
                name: "promo",
                schema: {
                    label: { type: "text" },
                    image: { type: "asset" },
                },
            },
        });

        expect(plan).toEqual({
            name: "promo",
            action: "create",
            properties: [],
            fields: [
                { field: "image", change: "added", type: "asset" },
                { field: "label", change: "added", type: "text" },
            ],
            whitelist: [],
        });
    });

    it("reads a component that matches the space as unchanged, server defaults and ids aside", () => {
        const plan = planComponent({
            local: {
                name: "hero",
                display_name: "Hero",
                is_nestable: true,
                component_group_name: "Content",
                schema: {
                    title: { type: "text", pos: 0 },
                    subtitle: { type: "text", pos: 1 },
                    items: {
                        type: "bloks",
                        pos: 2,
                        restrict_components: true,
                        // Order alone is not a whitelist change.
                        component_whitelist: ["banner", "card"],
                    },
                },
            },
            remote: remoteHero,
            remoteGroups: groups,
        });

        expect(plan.action).toBe("unchanged");
        expect(plan.properties).toEqual([]);
        expect(plan.fields).toEqual([]);
        expect(plan.whitelist).toEqual([]);
    });

    it("reports component properties, the group by name, and field-level changes", () => {
        const plan = planComponent({
            local: {
                name: "hero",
                display_name: "Hero banner",
                is_nestable: true,
                component_group_name: "Marketing",
                schema: {
                    title: { type: "text", pos: 0, required: true },
                    headline: { type: "text", pos: 1 },
                    items: {
                        type: "bloks",
                        pos: 2,
                        restrict_components: true,
                        component_whitelist: ["card", "promo"],
                    },
                },
            },
            remote: remoteHero,
            remoteGroups: groups,
        });

        expect(plan.action).toBe("update");
        expect(plan.properties).toEqual([
            { property: "display_name", from: "Hero", to: "Hero banner" },
            { property: "component_group", from: "Content", to: "Marketing" },
        ]);
        expect(plan.fields).toEqual([
            { field: "headline", change: "added", type: "text" },
            { field: "subtitle", change: "removed", type: "text" },
            {
                field: "title",
                change: "changed",
                type: "text",
                properties: [{ property: "required", from: false, to: true }],
            },
        ]);
        expect(plan.whitelist).toEqual([
            {
                field: "items",
                added: ["promo"],
                removed: ["banner"],
                restricted: { from: true, to: true },
            },
        ]);
    });

    it("counts a remote-only field property that says something as a change", () => {
        const plan = planComponent({
            local: {
                name: "hero",
                schema: {
                    ...remoteHero.schema,
                    title: { type: "text", pos: 0 },
                },
            },
            remote: {
                ...remoteHero,
                schema: {
                    ...remoteHero.schema,
                    title: { type: "text", pos: 0, translatable: true },
                },
            },
            remoteGroups: groups,
        });

        expect(plan.fields).toEqual([
            {
                field: "title",
                change: "changed",
                type: "text",
                properties: [
                    { property: "translatable", from: true, to: undefined },
                ],
            },
        ]);
    });

    it("plans presets as created or updated by name when --presets is on", () => {
        const plan = planComponent({
            local: {
                ...remoteHero,
                all_presets: [
                    { preset: { name: "Default" } },
                    { preset: { name: "Dark" } },
                ],
            },
            remote: remoteHero,
            remoteGroups: groups,
            presets: true,
        });

        expect(plan.presets).toEqual([
            { name: "Default", action: "update" },
            { name: "Dark", action: "create" },
        ]);
    });
});

describe("detectDestructiveChanges", () => {
    const planFor = (localSchema: Record<string, any>) =>
        planComponent({
            local: { name: "hero", schema: localSchema },
            remote: remoteHero,
            remoteGroups: groups,
        });

    it("flags a removed field", () => {
        const destructive = detectDestructiveChanges(
            planFor({
                title: remoteHero.schema.title,
                items: remoteHero.schema.items,
            }),
        );

        expect(destructive).toEqual([
            expect.objectContaining({
                kind: "field-removed",
                component: "hero",
                field: "subtitle",
            }),
        ]);
    });

    it("flags a removed field with a same-type field added as a likely rename", () => {
        const destructive = detectDestructiveChanges(
            planFor({
                title: remoteHero.schema.title,
                headline: { type: "text" },
                // A new field of another type is no rename candidate.
                image: { type: "asset" },
                items: remoteHero.schema.items,
            }),
        );

        expect(destructive).toEqual([
            expect.objectContaining({
                kind: "likely-rename",
                field: "subtitle",
                candidates: ["headline"],
            }),
        ]);
    });

    it("ignores removed layout fields, which hold no content", () => {
        const plan = planComponent({
            local: { name: "hero", schema: { title: { type: "text" } } },
            remote: {
                name: "hero",
                schema: {
                    title: { type: "text" },
                    "tab-1": { type: "tab", keys: ["title"] },
                },
            },
        });

        expect(detectDestructiveChanges(plan)).toEqual([]);
    });

    it("flags a whitelist that drops a component", () => {
        const destructive = detectDestructiveChanges(
            planFor({
                ...remoteHero.schema,
                items: {
                    ...remoteHero.schema.items,
                    component_whitelist: ["card"],
                },
            }),
        );

        expect(destructive).toEqual([
            expect.objectContaining({
                kind: "whitelist-narrowed",
                field: "items",
                removed: ["banner"],
            }),
        ]);
    });

    it("flags a field that becomes restricted", () => {
        const plan = planComponent({
            local: {
                name: "hero",
                schema: {
                    items: {
                        type: "bloks",
                        restrict_components: true,
                        component_whitelist: ["card"],
                    },
                },
            },
            remote: {
                name: "hero",
                schema: {
                    items: {
                        type: "bloks",
                        restrict_components: false,
                        component_whitelist: ["card"],
                    },
                },
            },
        });

        expect(detectDestructiveChanges(plan)).toEqual([
            expect.objectContaining({
                kind: "whitelist-narrowed",
                field: "items",
                removed: [],
            }),
        ]);
    });

    it("does not flag a widened whitelist, or one that is not enforced", () => {
        const widened = planFor({
            ...remoteHero.schema,
            items: {
                ...remoteHero.schema.items,
                component_whitelist: ["card", "banner", "promo"],
            },
        });
        const unrestricted = planFor({
            ...remoteHero.schema,
            items: {
                type: "bloks",
                pos: 2,
                restrict_components: false,
                component_whitelist: [],
            },
        });

        expect(detectDestructiveChanges(widened)).toEqual([]);
        expect(detectDestructiveChanges(unrestricted)).toEqual([]);
    });

    it("lists the components --ssot deletes", () => {
        expect(
            detectSsotRemovals(
                ["hero"],
                [{ name: "hero" }, { name: "legacy" }],
            ),
        ).toEqual([
            expect.objectContaining({
                kind: "component-removed",
                component: "legacy",
            }),
        ]);
    });
});

describe("planDatasource", () => {
    const local = {
        name: "colors",
        slug: "colors",
        dimensions: [{ name: "dark", entry_value: "dark" }],
        datasource_entries: [
            { name: "red", value: "#ff0000" },
            { name: "blue", value: "#00f", dimension_values: { dark: "#003" } },
            { name: "white", value: "#fff" },
            { name: "green", value: "#0f0" },
        ],
    };

    it("plans a new datasource and all its entries as creates", () => {
        expect(planDatasource({ local })).toEqual({
            name: "colors",
            slug: "colors",
            action: "create",
            properties: [],
            dimensionsAdded: ["dark"],
            entries: [
                { name: "red", action: "create" },
                { name: "blue", action: "create" },
                { name: "white", action: "create" },
                { name: "green", action: "create" },
            ],
            unchangedEntries: 0,
        });
    });

    it("reports slug, dimension, value and dimension value changes, and counts the rest", () => {
        const plan = planDatasource({
            local,
            remote: { id: 1, name: "colors", slug: "colours", dimensions: [] },
            remoteEntries: [
                { id: 1, name: "red", value: "#f00" },
                { id: 2, name: "blue", value: "#00f" },
                { id: 3, name: "white", value: "#fff" },
            ],
            remoteDimensionValues: { dark: { blue: "#001" } },
        });

        expect(plan).toEqual({
            name: "colors",
            slug: "colors",
            action: "update",
            properties: [{ property: "slug", from: "colours", to: "colors" }],
            dimensionsAdded: ["dark"],
            entries: [
                {
                    name: "red",
                    action: "update",
                    value: { property: "value", from: "#f00", to: "#ff0000" },
                },
                {
                    name: "blue",
                    action: "update",
                    dimensionValues: [
                        { property: "dark", from: "#001", to: "#003" },
                    ],
                },
                { name: "green", action: "create" },
            ],
            unchangedEntries: 1,
        });
    });

    it("reads a datasource that matches the space as unchanged", () => {
        const plan = planDatasource({
            local: {
                name: "sizes",
                slug: "sizes",
                dimensions: [],
                datasource_entries: [{ name: "s", value: "small" }],
            },
            remote: { id: 2, name: "sizes", slug: "sizes", dimensions: [] },
            remoteEntries: [{ id: 1, name: "s", value: "small" }],
        });

        expect(plan.action).toBe("unchanged");
        expect(plan.unchangedEntries).toBe(1);
    });
});

describe("destructive plan gaps (MAR-4104 review)", () => {
    it("flags a field whose type changes on the same key", () => {
        const plan = planComponent({
            local: {
                name: "article",
                schema: { body: { type: "richtext", pos: 0 } },
            },
            remote: {
                name: "article",
                schema: { body: { type: "textarea", pos: 0 } },
            },
        });

        expect(detectDestructiveChanges(plan)).toEqual([
            expect.objectContaining({
                kind: "type-changed",
                component: "article",
                field: "body",
                from: "textarea",
                to: "richtext",
            }),
        ]);
    });

    it("flags a narrowed whitelist on a link field restricted by content type", () => {
        const link = (whitelist: string[]) => ({
            type: "multilink",
            restrict_content_types: true,
            component_whitelist: whitelist,
        });
        const plan = planComponent({
            local: { name: "teaser", schema: { link: link(["page"]) } },
            remote: {
                name: "teaser",
                schema: { link: link(["page", "article"]) },
            },
        });

        expect(detectDestructiveChanges(plan)).toEqual([
            expect.objectContaining({
                kind: "whitelist-narrowed",
                field: "link",
                removed: ["article"],
            }),
        ]);
    });

    it("lists the groups --ssot deletes that no local component uses", () => {
        expect(
            detectSsotGroupRemovals(
                ["Content"],
                [{ name: "Content" }, { name: "Legacy" }],
            ),
        ).toEqual([
            expect.objectContaining({ kind: "group-removed", group: "Legacy" }),
        ]);
    });

    it("does not read a missing local pos as a change", () => {
        const plan = planComponent({
            local: {
                name: "card",
                schema: {
                    title: { type: "text" },
                    image: { type: "asset" },
                },
            },
            remote: {
                name: "card",
                schema: {
                    title: { type: "text", pos: 0 },
                    image: { type: "asset", pos: 1 },
                },
            },
        });

        expect(plan.action).toBe("unchanged");
        expect(plan.fields).toEqual([]);
    });

    it("still reports a pos the schema sets", () => {
        const plan = planComponent({
            local: {
                name: "card",
                schema: { title: { type: "text", pos: 2 } },
            },
            remote: {
                name: "card",
                schema: { title: { type: "text", pos: 0 } },
            },
        });

        expect(plan.fields).toEqual([
            expect.objectContaining({
                field: "title",
                properties: [{ property: "pos", from: 0, to: 2 }],
            }),
        ]);
    });
});

describe("a sync right after a sync plans nothing (MAR-4738)", () => {
    // Backpack's sb-alert template, as the schema file writes it.
    const alertTemplate =
        '{{@if(it.title?.[0]?.content?.content?.[0]?.content?.[0]?.text)}}<i>{{it.title[0].content.content[0].content[0].text}}</i>{{/if}}<span class="font-light"> | </span>{{@if(it.content?.[0]?.content?.content?.[0]?.content?.[0]?.text)}}<i>{{it.content[0].content.content[0].content[0].text}}</i>{{/if}}';

    const withTemplate = (local: unknown, remote: unknown) =>
        planComponent({
            local: { name: "sb-alert", preview_tmpl: local, schema: {} },
            remote: {
                id: 1,
                name: "sb-alert",
                preview_tmpl: remote,
                schema: {},
            },
        });

    it.each([
        ["without its span tags", alertTemplate.replace(/<\/?span[^>]*>/g, "")],
        [
            "with its span tags turned into spaces",
            alertTemplate.replace(/<\/?span[^>]*>/g, " "),
        ],
        [
            "with its span attributes rewritten",
            alertTemplate.replace(
                '<span class="font-light">',
                "<span class='font-light'>",
            ),
        ],
        [
            "with its markup escaped",
            alertTemplate
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;"),
        ],
        [
            "with its whitespace changed",
            `\n  ${alertTemplate.replace("</i>", "</i>\n")}  \n`,
        ],
    ])(
        "reads a preview_tmpl the space stores %s as unchanged",
        (_how, remote) => {
            const plan = withTemplate(alertTemplate, remote);

            expect(plan.action).toBe("unchanged");
            expect(plan.properties).toEqual([]);
        },
    );

    it.each([
        [undefined, null],
        ["", null],
        [null, ""],
        ["", undefined],
    ])(
        "reads a blank preview_tmpl %j against %j as unchanged",
        (local, remote) => {
            expect(withTemplate(local, remote).action).toBe("unchanged");
        },
    );

    it("still reports a preview_tmpl whose logic or text changes", () => {
        const changed = alertTemplate.replace(" | ", " — ");
        const plan = withTemplate(changed, alertTemplate);

        expect(plan.action).toBe("update");
        expect(plan.properties).toEqual([
            { property: "preview_tmpl", from: alertTemplate, to: changed },
        ]);
    });

    it("keeps template comparisons and arrows that are not tags", () => {
        expect(
            normalizePreviewTemplate(
                "{{@if(index < 3)}}<div><i>{{val.content}}</i></div>{{/if}} {{@each(it.content) => val}}",
            ),
        ).toBe(
            "{{@if(index<3)}}{{val.content}}{{/if}}{{@each(it.content)=>val}}",
        );
        expect(normalizePreviewTemplate(null)).toBe(null);
    });

    const content = {
        _uid: "648638bd-357a-4340-885e-aaa4011e8020",
        component: "sb-alert",
        custom_classname: "",
        title: [
            {
                _uid: "6ba2d328-27ac-4a4b-9cae-c27cec68385a",
                component: "sb-body-text",
                content: {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                { type: "text", text: "Title goes here" },
                            ],
                        },
                    ],
                },
            },
        ],
    };
    const image =
        "https://backpack.example.com/Alert/storyblok/sb-alert-default.webp";

    const localAlert = {
        name: "sb-alert",
        schema: {},
        all_presets: [
            { preset: { name: "Default (Section)", preset: content, image } },
        ],
    };
    const remoteAlert = {
        id: 7,
        name: "sb-alert",
        schema: {},
        all_presets: [{ id: 70, name: "Default (Section)", component_id: 7 }],
    };
    // A preset as the space lists it: ids, dates and its own empty keys.
    const remotePreset = (overrides: Record<string, unknown> = {}) => ({
        id: 70,
        name: "Default (Section)",
        preset: content,
        component_id: 7,
        space_id: 295911465792355,
        created_at: "2026-10-27T18:02:11.000Z",
        updated_at: "2026-10-27T18:02:11.000Z",
        image,
        color: null,
        icon: null,
        description: null,
        ...overrides,
    });
    const planPresets = (remotePresets?: any[]) =>
        planComponent({
            local: localAlert,
            remote: remoteAlert,
            presets: true,
            remotePresets,
        }).presets;

    it("plans a preset whose content matches the space as unchanged", () => {
        expect(planPresets([remotePreset()])).toEqual([
            { name: "Default (Section)", action: "unchanged" },
        ]);
    });

    it("reads ids, dates, the space's own keys, a new _uid and the image's protocol as no change", () => {
        expect(
            planPresets([
                remotePreset({
                    image: image.replace("https:", ""),
                    preset: {
                        ...content,
                        _uid: "another-uid",
                        title: [
                            { ...content.title[0], _uid: "another-uid-too" },
                        ],
                        added_by_the_space: "",
                    },
                }),
            ]),
        ).toEqual([{ name: "Default (Section)", action: "unchanged" }]);
    });

    it("plans an update only on a real difference, and says where", () => {
        const edited = structuredClone(content);
        edited.title[0].content.content[0].content[0].text =
            "Edited in Storyblok";

        expect(
            planPresets([
                remotePreset({
                    preset: { ...edited, extra: "set by an editor" },
                    image: "https://a.storyblok.com/f/1/other.webp",
                }),
            ]),
        ).toEqual([
            {
                name: "Default (Section)",
                action: "update",
                changedKeys: [
                    "image",
                    "preset.title.0.content.content.0.content.0.text",
                    "preset.extra",
                ],
            },
        ]);
    });

    it("still plans an update by name when the space's presets were not read", () => {
        expect(planPresets(undefined)).toEqual([
            { name: "Default (Section)", action: "update" },
        ]);
    });
});
