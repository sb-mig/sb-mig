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
});
