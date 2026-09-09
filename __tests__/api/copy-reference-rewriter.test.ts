import { describe, expect, it } from "vitest";

import {
    createEmptyCopyMaps,
    rewriteCopyReferences,
} from "../../src/api/copy/index.js";

describe("copy reference rewriter", () => {
    it("rewrites asset and story references from copy maps", () => {
        const maps = createEmptyCopyMaps();
        maps.assetIds.set(300, {
            id: 900,
            filename: "https://a.storyblok.com/f/target/hero.jpg",
        });
        maps.assetFilenames.set(
            "https://a.storyblok.com/f/source/gallery.jpg",
            "https://a.storyblok.com/f/target/gallery.jpg",
        );
        maps.storyIds.set(100, 800);
        maps.storyIds.set(101, 801);
        maps.storyUuids.set("source-story-uuid", "target-story-uuid");

        const content = {
            component: "page",
            image: {
                id: 300,
                filename: "https://a.storyblok.com/f/source/hero.jpg",
            },
            gallery: [
                {
                    id: 301,
                    filename: "https://a.storyblok.com/f/source/gallery.jpg",
                },
            ],
            cta: {
                linktype: "story",
                id: 100,
            },
            related: [100, 101, 999],
            body: {
                type: "doc",
                content: [
                    {
                        type: "link",
                        attrs: {
                            linktype: "story",
                            uuid: "source-story-uuid",
                        },
                    },
                    {
                        type: "blok",
                        attrs: {
                            body: [
                                {
                                    component: "card",
                                    media: {
                                        id: 300,
                                        filename:
                                            "https://a.storyblok.com/f/source/hero.jpg",
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        };

        const result = rewriteCopyReferences({
            value: content,
            maps,
            schemas: {
                page: {
                    related: {
                        type: "options",
                        source: "internal_stories",
                    },
                },
            },
        });

        expect(result.value).toMatchObject({
            image: {
                id: 900,
                filename: "https://a.storyblok.com/f/target/hero.jpg",
            },
            gallery: [
                {
                    id: 301,
                    filename: "https://a.storyblok.com/f/target/gallery.jpg",
                },
            ],
            cta: {
                id: 800,
            },
            related: [800, 801, 999],
            body: {
                content: [
                    {
                        attrs: {
                            uuid: "target-story-uuid",
                        },
                    },
                    {
                        attrs: {
                            body: [
                                {
                                    media: {
                                        id: 900,
                                        filename:
                                            "https://a.storyblok.com/f/target/hero.jpg",
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        });
        expect(result.records.map((record) => record.path).sort()).toEqual(
            [
                "$.body.content[0].attrs.uuid",
                "$.body.content[1].attrs.body[0].media.filename",
                "$.body.content[1].attrs.body[0].media.id",
                "$.cta.id",
                "$.gallery[0].filename",
                "$.image.filename",
                "$.image.id",
                "$.related[0]",
                "$.related[1]",
            ].sort(),
        );
        expect(result.warnings).toEqual([]);
    });

    it("rewrites multi-options string uuids via storyUuids and keeps numeric ids via storyIds", () => {
        const maps = createEmptyCopyMaps();
        maps.storyIds.set(100, 800);
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000002",
            "010fe283-aaaa-bbbb-cccc-000000000002",
        );

        const content = {
            component: "page",
            related: [
                "2166697c-aaaa-bbbb-cccc-000000000001",
                100,
                "2166697c-aaaa-bbbb-cccc-000000000002",
                "99999999-not-a-known-source-uuid-999",
            ],
        };

        const result = rewriteCopyReferences({
            value: content,
            maps,
            schemas: {
                page: {
                    related: {
                        type: "options",
                        source: "internal_stories",
                    },
                },
            },
        });

        expect(result.value.related).toEqual([
            "010fe283-aaaa-bbbb-cccc-000000000001",
            800,
            "010fe283-aaaa-bbbb-cccc-000000000002",
            "99999999-not-a-known-source-uuid-999",
        ]);
        expect(result.records.map((record) => record.path).sort()).toEqual([
            "$.related[0]",
            "$.related[1]",
            "$.related[2]",
        ]);
    });

    it("rewrites single-select option story references", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );

        const content = {
            component: "page",
            featured: "2166697c-aaaa-bbbb-cccc-000000000001",
        };

        const result = rewriteCopyReferences({
            value: content,
            maps,
            schemas: {
                page: {
                    featured: {
                        type: "option",
                        source: "internal_stories",
                    },
                },
            },
        });

        expect(result.value.featured).toBe(
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        expect(result.records).toHaveLength(1);
    });

    it("rewrites multilink story links whose id is a string uuid", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );

        const content = {
            component: "page",
            cta: {
                fieldtype: "multilink",
                linktype: "story",
                id: "2166697c-aaaa-bbbb-cccc-000000000001",
                cached_url: "blog/categories/some-category",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.cta.id).toBe(
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        expect(result.records).toEqual([
            expect.objectContaining({
                type: "story",
                path: "$.cta.id",
                sourceValue: "2166697c-aaaa-bbbb-cccc-000000000001",
                targetValue: "010fe283-aaaa-bbbb-cccc-000000000001",
            }),
        ]);
    });

    it("rewrites a relinked link's stored path to the target story's path", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");

        const content = {
            component: "page",
            cta: {
                fieldtype: "multilink",
                linktype: "story",
                id: "source-header-uuid",
                url: "",
                cached_url: "shared/header",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.cta.id).toBe("target-header-uuid");
        expect(result.value.cta.cached_url).toBe("imported/shared/header");
        expect(result.records).toContainEqual(
            expect.objectContaining({
                type: "story",
                path: "$.cta.cached_url",
                sourceValue: "shared/header",
                targetValue: "imported/shared/header",
                field: "path",
            }),
        );
    });

    it("repairs the stored path of a link that already points at the target story", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");
        maps.storyFullSlugs.set("target-header-uuid", "imported/shared/header");

        // An earlier copy relinked the uuid but left the path behind, which is
        // exactly the state this feature exists to clean up.
        const content = {
            component: "page",
            cta: {
                linktype: "story",
                id: "target-header-uuid",
                cached_url: "shared/header",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.cta.id).toBe("target-header-uuid");
        expect(result.value.cta.cached_url).toBe("imported/shared/header");
    });

    it("keeps anchors, query strings and slash conventions in a rewritten path", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");

        const content = {
            component: "page",
            anchored: {
                linktype: "story",
                id: "source-header-uuid",
                cached_url: "shared/header#contact",
            },
            queried: {
                linktype: "story",
                id: "source-header-uuid",
                cached_url: "/shared/header/?utm=1",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.anchored.cached_url).toBe(
            "imported/shared/header#contact",
        );
        expect(result.value.queried.cached_url).toBe(
            "/imported/shared/header/?utm=1",
        );
    });

    it("leaves the stored path alone when the target path is unknown", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");

        const content = {
            component: "page",
            cta: {
                linktype: "story",
                id: "source-header-uuid",
                cached_url: "shared/header",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        // A guessed path would be worse than a stale one.
        expect(result.value.cta.id).toBe("target-header-uuid");
        expect(result.value.cta.cached_url).toBe("shared/header");
    });

    it("rewrites a richtext link's href, as a uuid or as a path", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");

        const content = {
            component: "page",
            body: {
                type: "doc",
                content: [
                    {
                        type: "link",
                        attrs: {
                            linktype: "story",
                            uuid: "source-header-uuid",
                            href: "shared/header",
                        },
                    },
                    {
                        type: "link",
                        attrs: {
                            linktype: "story",
                            uuid: "source-header-uuid",
                            href: "source-header-uuid",
                        },
                    },
                ],
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.body.content[0].attrs.href).toBe(
            "imported/shared/header",
        );
        // A uuid in the href slot is a reference, not a path.
        expect(result.value.body.content[1].attrs.href).toBe(
            "target-header-uuid",
        );
    });

    it("leaves an already-relinked uuid in a path slot alone on a second pass", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");
        maps.storyFullSlugs.set("target-header-uuid", "imported/shared/header");

        // Storyblok stores the uuid in `href` for an internal richtext link,
        // so the second relink of the same story reads back what the first one
        // wrote.
        const content = {
            component: "page",
            body: {
                type: "doc",
                content: [
                    {
                        type: "link",
                        attrs: {
                            linktype: "story",
                            uuid: "source-header-uuid",
                            href: "source-header-uuid",
                        },
                    },
                ],
            },
        };

        const first = rewriteCopyReferences({ value: content, maps });
        const second = rewriteCopyReferences({ value: first.value, maps });

        expect(first.value.body.content[0].attrs.href).toBe(
            "target-header-uuid",
        );
        // A second pass must not mistake the reference it just wrote for a
        // path and overwrite it with a slug.
        expect(second.value.body.content[0].attrs.href).toBe(
            "target-header-uuid",
        );
        expect(second.records).toHaveLength(0);
    });

    it("repairs the stored path of a link that references a numeric story id", () => {
        const maps = createEmptyCopyMaps();
        maps.storyIds.set(11, 22);
        maps.storyIdFullSlugs.set(11, "imported/shared/header");
        maps.storyIdFullSlugs.set(22, "imported/shared/header");

        const content = {
            component: "page",
            cta: {
                linktype: "story",
                id: 11,
                cached_url: "shared/header",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        // The id is remapped, and the path beside it must not be left lying.
        expect(result.value.cta.id).toBe(22);
        expect(result.value.cta.cached_url).toBe("imported/shared/header");

        const second = rewriteCopyReferences({ value: result.value, maps });

        expect(second.value.cta.cached_url).toBe("imported/shared/header");
        expect(second.records).toHaveLength(0);
    });

    it("rewrites the story object a link caches next to itself", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("source-header-uuid", "target-header-uuid");
        maps.storyFullSlugs.set("source-header-uuid", "imported/shared/header");

        const content = {
            component: "page",
            cta: {
                linktype: "story",
                id: "source-header-uuid",
                cached_url: "shared/header",
                story: {
                    name: "Header",
                    full_slug: "shared/header",
                    url: "shared/header",
                },
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.cta.story.full_slug).toBe("imported/shared/header");
        expect(result.value.cta.story.url).toBe("imported/shared/header");
    });

    it("rewrites bare source-story uuids in unknown fields via the safety net", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );

        const content = {
            component: "shared-selector",
            _uid: "2166697c-aaaa-bbbb-cccc-000000000001",
            shared_component: "2166697c-aaaa-bbbb-cccc-000000000001",
            some_custom_field: "not-a-story-uuid",
            nested: {
                deep_reference: "2166697c-aaaa-bbbb-cccc-000000000001",
            },
        };

        const result = rewriteCopyReferences({ value: content, maps });

        expect(result.value.shared_component).toBe(
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        expect(result.value.nested.deep_reference).toBe(
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        expect(result.value.some_custom_field).toBe("not-a-story-uuid");
        expect(result.value._uid).toBe("2166697c-aaaa-bbbb-cccc-000000000001");
        expect(result.records.map((record) => record.path).sort()).toEqual([
            "$.nested.deep_reference",
            "$.shared_component",
        ]);
        expect(result.records.every((record) => record.type === "story")).toBe(
            true,
        );
    });

    it("rewrites the blog-articles-section regression fixture (categories + filter_groups)", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000001",
        );
        maps.storyUuids.set(
            "2166697c-aaaa-bbbb-cccc-000000000002",
            "010fe283-aaaa-bbbb-cccc-000000000002",
        );

        const content = {
            component: "page",
            body: [
                {
                    component: "blog-articles-section",
                    _uid: "5f4dcc3b-aaaa-bbbb-cccc-000000000009",
                    categories: [
                        "2166697c-aaaa-bbbb-cccc-000000000001",
                        "2166697c-aaaa-bbbb-cccc-000000000002",
                    ],
                    filter_groups: [
                        {
                            component: "filter-group",
                            _uid: "5f4dcc3b-aaaa-bbbb-cccc-000000000010",
                            categories: [
                                "2166697c-aaaa-bbbb-cccc-000000000002",
                            ],
                        },
                    ],
                },
            ],
        };

        const result = rewriteCopyReferences({
            value: content,
            maps,
            schemas: {
                page: { body: { type: "bloks" } },
                "blog-articles-section": {
                    categories: {
                        type: "options",
                        source: "internal_stories",
                    },
                    filter_groups: { type: "bloks" },
                },
                "filter-group": {
                    categories: {
                        type: "options",
                        source: "internal_stories",
                    },
                },
            },
        });

        expect(result.value.body[0].categories).toEqual([
            "010fe283-aaaa-bbbb-cccc-000000000001",
            "010fe283-aaaa-bbbb-cccc-000000000002",
        ]);
        expect(result.value.body[0].filter_groups[0].categories).toEqual([
            "010fe283-aaaa-bbbb-cccc-000000000002",
        ]);
        expect(result.records).toHaveLength(3);
    });
});
