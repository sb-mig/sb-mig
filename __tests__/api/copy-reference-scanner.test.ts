import type { CopyComponentSchemaRegistry } from "../../src/api/copy/types.js";

import { describe, expect, it } from "vitest";

import {
    scanStoriesReferences,
    scanStoryReferences,
} from "../../src/api/copy/index.js";

const schemas: CopyComponentSchemaRegistry = {
    page: {
        hero: { type: "bloks" },
        related: { type: "options", source: "internal_stories" },
        body: { type: "richtext" },
        pluginData: { type: "custom", plugin: "storyblok-cloudinary" },
    },
    hero: {
        image: { type: "asset" },
        gallery: { type: "multiasset" },
        cta: { type: "multilink" },
        body: { type: "richtext" },
    },
    card: {
        media: { type: "asset" },
        link: { type: "multilink" },
    },
};

const story = {
    id: 100,
    uuid: "story-uuid-100",
    full_slug: "blog/post",
    parent_id: 90,
    alternates: [{ id: 101, parent_id: 91 }],
    content: {
        component: "page",
        hero: [
            {
                component: "hero",
                image: {
                    id: 300,
                    filename: "https://a.storyblok.com/f/111/hero.jpg",
                },
                gallery: [
                    {
                        id: 301,
                        filename: "https://a.storyblok.com/f/111/gallery-1.jpg",
                    },
                    {
                        id: 302,
                        filename: "https://a.storyblok.com/f/111/gallery-2.jpg",
                    },
                ],
                cta: {
                    fieldtype: "multilink",
                    linktype: "story",
                    id: 102,
                    cached_url: "blog/related",
                },
                body: {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                {
                                    type: "link",
                                    attrs: {
                                        linktype: "story",
                                        uuid: "story-uuid-103",
                                    },
                                },
                            ],
                        },
                        {
                            type: "blok",
                            attrs: {
                                body: [
                                    {
                                        component: "card",
                                        media: {
                                            id: 303,
                                            filename:
                                                "https://a.storyblok.com/f/111/card.jpg",
                                        },
                                        link: {
                                            fieldtype: "multilink",
                                            linktype: "story",
                                            id: 104,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ],
        related: [105, 106],
        body: {
            type: "doc",
            content: [
                {
                    type: "blok",
                    attrs: {
                        body: [
                            {
                                component: "missing-component",
                                asset: {
                                    id: 999,
                                    filename:
                                        "https://a.storyblok.com/f/111/missing.jpg",
                                },
                            },
                        ],
                    },
                },
            ],
        },
        pluginData: {
            plugin: "storyblok-cloudinary",
            raw: "opaque-reference-data",
        },
        unknownField: {
            maybe: "reference",
        },
    },
};

describe("copy reference scanner", () => {
    it("scans schema-aware asset and story references across nested fields", () => {
        const result = scanStoryReferences({ story, schemas });

        expect(result.assetReferences).toEqual([
            {
                type: "asset_reference",
                sourceStoryId: 100,
                sourceStoryUuid: "story-uuid-100",
                sourceStoryFullSlug: "blog/post",
                assetId: 300,
                filename: "https://a.storyblok.com/f/111/hero.jpg",
                path: "content.hero[0].image",
                status: "planned",
            },
            {
                type: "asset_reference",
                sourceStoryId: 100,
                sourceStoryUuid: "story-uuid-100",
                sourceStoryFullSlug: "blog/post",
                assetId: 301,
                filename: "https://a.storyblok.com/f/111/gallery-1.jpg",
                path: "content.hero[0].gallery[0]",
                status: "planned",
            },
            {
                type: "asset_reference",
                sourceStoryId: 100,
                sourceStoryUuid: "story-uuid-100",
                sourceStoryFullSlug: "blog/post",
                assetId: 302,
                filename: "https://a.storyblok.com/f/111/gallery-2.jpg",
                path: "content.hero[0].gallery[1]",
                status: "planned",
            },
            {
                type: "asset_reference",
                sourceStoryId: 100,
                sourceStoryUuid: "story-uuid-100",
                sourceStoryFullSlug: "blog/post",
                assetId: 303,
                filename: "https://a.storyblok.com/f/111/card.jpg",
                path: "content.hero[0].body.content[1].attrs.body[0].media",
                status: "planned",
            },
        ]);

        expect(result.assetNodes).toEqual([
            {
                type: "asset",
                sourceId: 300,
                sourceFilename: "https://a.storyblok.com/f/111/hero.jpg",
                action: "unknown",
            },
            {
                type: "asset",
                sourceId: 301,
                sourceFilename: "https://a.storyblok.com/f/111/gallery-1.jpg",
                action: "unknown",
            },
            {
                type: "asset",
                sourceId: 302,
                sourceFilename: "https://a.storyblok.com/f/111/gallery-2.jpg",
                action: "unknown",
            },
            {
                type: "asset",
                sourceId: 303,
                sourceFilename: "https://a.storyblok.com/f/111/card.jpg",
                action: "unknown",
            },
        ]);

        expect(result.storyReferences).toEqual([
            expect.objectContaining({
                referencedStoryId: 90,
                path: "parent_id",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 101,
                path: "alternates[0].id",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 91,
                path: "alternates[0].parent_id",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 102,
                path: "content.hero[0].cta.id",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryUuid: "story-uuid-103",
                path: "content.hero[0].body.content[0].content[0].attrs.uuid",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 104,
                path: "content.hero[0].body.content[1].attrs.body[0].link.id",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 105,
                path: "content.related[0]",
                status: "preserved_external",
            }),
            expect.objectContaining({
                referencedStoryId: 106,
                path: "content.related[1]",
                status: "preserved_external",
            }),
        ]);

        expect(result.missingSchemas).toEqual(["missing-component"]);
        expect(result.opaqueFields).toEqual([
            expect.objectContaining({
                component: "missing-component",
                reason: "unknown_schema",
                path: "content.body.content[0].attrs.body[0]",
            }),
            expect.objectContaining({
                component: "page",
                field: "pluginData",
                reason: "plugin_field",
                plugin: "storyblok-cloudinary",
                path: "content.pluginData",
            }),
            expect.objectContaining({
                component: "page",
                field: "unknownField",
                reason: "unsupported_field",
                path: "content.unknownField",
            }),
        ]);
        expect(result.warnings.map((warning) => warning.code)).toEqual([
            "missing_component_schema",
            "plugin_field",
            "unsupported_field",
        ]);
        expect(result.errors).toEqual([]);
    });

    it("scans uuid-based story references (multi-options, single option, multilink string id)", () => {
        const uuidSchemas: CopyComponentSchemaRegistry = {
            page: { body: { type: "bloks" } },
            "blog-articles-section": {
                categories: { type: "options", source: "internal_stories" },
                featured: { type: "option", source: "internal_stories" },
                cta: { type: "multilink" },
                filter_groups: { type: "bloks" },
            },
            "filter-group": {
                categories: { type: "options", source: "internal_stories" },
            },
        };

        const result = scanStoryReferences({
            story: {
                id: 200,
                uuid: "aaaa697c-aaaa-bbbb-cccc-000000000200",
                full_slug: "blog",
                content: {
                    component: "page",
                    body: [
                        {
                            component: "blog-articles-section",
                            categories: [
                                "2166697c-aaaa-bbbb-cccc-000000000001",
                                105,
                                "not-a-uuid",
                            ],
                            featured: "2166697c-aaaa-bbbb-cccc-000000000003",
                            cta: {
                                fieldtype: "multilink",
                                linktype: "story",
                                id: "2166697c-aaaa-bbbb-cccc-000000000004",
                                cached_url: "blog/categories/some-category",
                            },
                            filter_groups: [
                                {
                                    component: "filter-group",
                                    categories: [
                                        "2166697c-aaaa-bbbb-cccc-000000000002",
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
            schemas: uuidSchemas,
        });

        expect(result.storyReferences).toEqual([
            expect.objectContaining({
                referencedStoryUuid: "2166697c-aaaa-bbbb-cccc-000000000001",
                path: "content.body[0].categories[0]",
            }),
            expect.objectContaining({
                referencedStoryId: 105,
                path: "content.body[0].categories[1]",
            }),
            expect.objectContaining({
                referencedStoryUuid: "2166697c-aaaa-bbbb-cccc-000000000003",
                path: "content.body[0].featured",
            }),
            expect.objectContaining({
                referencedStoryUuid: "2166697c-aaaa-bbbb-cccc-000000000004",
                path: "content.body[0].cta.id",
            }),
            expect.objectContaining({
                referencedStoryUuid: "2166697c-aaaa-bbbb-cccc-000000000002",
                path: "content.body[0].filter_groups[0].categories[0]",
            }),
        ]);
    });

    it("marks story references unresolved when reference policy is fail", () => {
        const result = scanStoryReferences({
            story,
            schemas,
            options: { referencePolicy: "fail" },
        });

        expect(result.storyReferences.length).toBeGreaterThan(0);
        expect(
            result.storyReferences.every(
                (reference) => reference.status === "unresolved",
            ),
        ).toBe(true);
    });

    it("dedupes asset nodes when scanning multiple stories", () => {
        const result = scanStoriesReferences({
            stories: [
                story,
                {
                    ...story,
                    id: 101,
                    uuid: "story-uuid-101",
                    content: {
                        component: "hero",
                        image: {
                            id: 300,
                            filename: "https://a.storyblok.com/f/111/hero.jpg",
                        },
                    },
                },
            ],
            schemas,
        });

        expect(result.assetReferences).toHaveLength(5);
        expect(result.assetNodes).toHaveLength(4);
        expect(result.missingSchemas).toEqual(["missing-component"]);
    });

    it("reports progress while scanning multiple stories", () => {
        const progress: Array<{
            scanned: number;
            total: number;
            storyFullSlug?: string;
        }> = [];

        scanStoriesReferences({
            stories: Array.from({ length: 25 }, (_, index) => ({
                ...story,
                id: index + 1,
                full_slug: `blog/post-${index + 1}`,
            })),
            schemas,
            options: {
                onProgress: (event) => progress.push(event),
            },
        });

        expect(progress).toEqual([
            {
                scanned: 10,
                total: 25,
                storyFullSlug: "blog/post-10",
            },
            {
                scanned: 20,
                total: 25,
                storyFullSlug: "blog/post-20",
            },
            {
                scanned: 25,
                total: 25,
                storyFullSlug: "blog/post-25",
            },
        ]);
    });
});
