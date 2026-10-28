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
    // sb-accordion in Backpack 4.11.0, and as the sandbox space stored it
    // (read back through the Storyblok MCP after #429's first live check).
    const accordionTemplate =
        '{{@if(it.content?.length > 0)}}<span class="font-regular">{{it.content.length}} {{@if(it.content.length === 1)}}accordion item{{#else}}accordion items{{/if}}</span>{{#else}}<span class="font-light">Empty</span>{{/if}}';
    const accordionStored =
        '{{@if(it.content?.length &gt; 0)}}<span class="font-regular">{{it.content.length}} {{@if(it.content.length === 1)}}accordion item{{#else}}accordion items{{/if}}</span>{{#else}}<span class="font-light">Empty</span>{{/if}}';

    const withTemplate = (local: unknown, remote: unknown) =>
        planComponent({
            local: { name: "sb-accordion", preview_tmpl: local, schema: {} },
            remote: {
                id: 1,
                name: "sb-accordion",
                preview_tmpl: remote,
                schema: {},
            },
        });

    it("reads sb-accordion's preview_tmpl as the space stores it as unchanged", () => {
        const plan = withTemplate(accordionTemplate, accordionStored);

        expect(plan.action).toBe("unchanged");
        expect(plan.properties).toEqual([]);
    });

    // As the sandbox stored them: Storyblok drops the tags and attributes
    // its docs don't allow, and keeps their text (MAR-4738 live check).
    it.each([
        ["sb-headline", "<i>{{it.content}}</i>", "{{it.content}}"],
        [
            "sb-cta-card",
            "<div>⚠️ <strong>Heads up!</strong> This component will be retired in Backpack v5. Please switch to <strong>Card</strong> using the <em>CTA Card</em> preset.</div>",
            "<div>⚠️ <strong>Heads up!</strong> This component will be retired in Backpack v5. Please switch to <strong>Card</strong> using the CTA Card preset.</div>",
        ],
        [
            "sb-card-primitive-body",
            '{{@if(index !== it.content.length - 1)}}\n  <div style="margin: 4px 0;"></div>\n{{/if}}',
            "{{@if(index !== it.content.length - 1)}}\n  <div></div>\n{{/if}}",
        ],
        [
            "sb-card-banner",
            "\n{{@if(it.text)}}\n  <div style=\"background-color: {{@if(it.design?.intent?.base === 'primary')}}var(--color-primary-600){{#else}}var(--color-neutral-600){{/if}}; color: white; padding: 2px 8px;\">\n    <i>{{it.text}}</i>\n  </div>\n{{/if}}\n",
            "\n{{@if(it.text)}}\n  <div> {{it.text}}\n  </div>\n{{/if}}\n",
        ],
    ])(
        "reads %s's preview_tmpl, sanitised by the space, as unchanged",
        (_name, local, stored) => {
            const plan = withTemplate(local, stored);

            expect(plan.action).toBe("unchanged");
            expect(plan.properties).toEqual([]);
        },
    );

    it.each([
        [
            "a bare <",
            "{{@if(index < 3)}}<div>{{val.content}}</div>{{/if}}",
            "{{@if(index &lt; 3)}}<div>{{val.content}}</div>{{/if}}",
        ],
        // How `&&` was stored before Storyblok's fix (storyblok/monoblok#797).
        [
            "&&",
            "{{@if(it.a && it.b)}}<div>both</div>{{/if}}",
            "{{@if(it.a &amp;&amp; it.b)}}<div>both</div>{{/if}}",
        ],
        [
            "a class quoted differently",
            "<span class='font-light'>x</span>",
            '<span class="font-light">x</span>',
        ],
    ])(
        "reads %s as the space stores it as unchanged",
        (_how, local, stored) => {
            expect(withTemplate(local, stored).action).toBe("unchanged");
        },
    );

    it("reads a preview_tmpl whose whitespace the space changes as unchanged", () => {
        // Line endings, runs of spaces, and whitespace around the template.
        const respaced = `\n  ${accordionStored.replace("}} {{", "}}\r\n    {{")}  \n`;

        expect(withTemplate(accordionTemplate, respaced).action).toBe(
            "unchanged",
        );
    });

    it.each([
        [
            "a changed class",
            accordionTemplate.replace("font-light", "font-bold"),
        ],
        [
            "a span removed",
            accordionTemplate
                .replace('<span class="font-light">', "")
                .replace("Empty</span>", "Empty"),
        ],
        [
            "a span added",
            accordionTemplate.replace(
                "{{it.content.length}}",
                '<span class="font-bold">{{it.content.length}}</span>',
            ),
        ],
        [
            "a strong added",
            accordionTemplate.replace("Empty", "<strong>Empty</strong>"),
        ],
        [
            "a div added, beside an attribute the space drops",
            accordionTemplate
                .replace(
                    '<span class="font-light">',
                    '<span class="font-light" title="x"><div class="note">',
                )
                .replace("Empty</span>", "Empty</div></span>"),
        ],
    ])("still reports %s as an update", (_how, local) => {
        const plan = withTemplate(local, accordionStored);

        expect(plan.action).toBe("update");
        expect(plan.properties).toEqual([
            { property: "preview_tmpl", from: accordionStored, to: local },
        ]);
    });

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
        const changed = accordionTemplate.replace("> 0", "> 1");
        const plan = withTemplate(changed, accordionStored);

        expect(plan.action).toBe("update");
        expect(plan.properties).toEqual([
            { property: "preview_tmpl", from: accordionStored, to: changed },
        ]);
    });

    it("keeps the supported tags with their class, and decodes entities", () => {
        expect(normalizePreviewTemplate(accordionStored)).toBe(
            accordionTemplate,
        );
        expect(
            normalizePreviewTemplate(
                '<P Class="a" id="b"><em>x</em> <UL><li style="c">y</li></UL><br/></P>',
            ),
        ).toBe('<p class="a">x <ul><li>y</li></ul></p>');
        expect(normalizePreviewTemplate(null)).toBe(null);
    });

    it("leaves an entity outside Unicode as written instead of throwing", () => {
        expect(
            normalizePreviewTemplate("a &#x110000; b &#99999999999; c &#x41;"),
        ).toBe("a &#x110000; b &#99999999999; c A");
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
