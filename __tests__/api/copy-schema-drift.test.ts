import { describe, expect, it } from "vitest";

import {
    findSchemaDrift,
    formatSchemaDriftLines,
    formatStoriesWillFailLine,
    summarizeStoriesWillFail,
} from "../../src/api/copy/schema-drift.js";

const blockquoteSchema = {
    content: { type: "richtext" },
    citation: { type: "richtext" },
};

const pageSchema = {
    body: { type: "bloks" },
    cta: { type: "multilink" },
    image: { type: "asset" },
    gallery: { type: "multiasset" },
    title: { type: "text" },
};

const story = (id: number, fullSlug: string, content: any) => ({
    id,
    full_slug: fullSlug,
    content,
});

const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
};

describe("copy stories schema drift", () => {
    // MAR-3057 R4 (a) canary. Mutation that must turn it red: remove the
    // richtext branch from the drift check.
    it("counts a string in a richtext field as drift", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "new-york/about", {
                    component: "page",
                    body: [
                        {
                            component: "sb-blockquote",
                            _uid: "q1",
                            content: "A plain quote",
                            citation: doc,
                        },
                    ],
                }),
            ],
            targetSchemas: {
                page: pageSchema,
                "sb-blockquote": blockquoteSchema,
            },
        });

        expect(summary).toMatchObject({
            occurrences: 1,
            stories: 1,
            storyFullSlugs: ["new-york/about"],
            groups: [
                {
                    component: "sb-blockquote",
                    field: "content",
                    expected: "richtext",
                    got: "string",
                    count: 1,
                },
            ],
        });
        expect(summary.findings[0]).toMatchObject({
            sourceStoryId: 1,
            sourceFullSlug: "new-york/about",
            component: "sb-blockquote",
            field: "content",
            uid: "q1",
            path: "content.body[0].content",
        });
    });

    it("accepts a prosemirror doc or an empty value in a richtext field", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "sb-blockquote",
                    content: doc,
                    citation: "",
                }),
                story(2, "b", { component: "sb-blockquote", content: null }),
                story(3, "c", { component: "sb-blockquote" }),
            ],
            targetSchemas: { "sb-blockquote": blockquoteSchema },
        });

        expect(summary.occurrences).toBe(0);
        expect(summary.stories).toBe(0);
    });

    it("counts an object that is not a doc in a richtext field as drift", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "sb-blockquote",
                    content: { text: "not a doc" },
                }),
            ],
            targetSchemas: { "sb-blockquote": blockquoteSchema },
        });

        expect(summary.groups).toEqual([
            {
                component: "sb-blockquote",
                field: "content",
                expected: "richtext",
                got: "object",
                count: 1,
            },
        ]);
    });

    it("checks bloks, multilink, asset and multiasset, and nothing else", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "page",
                    body: { component: "teaser" },
                    cta: "https://example.com",
                    image: "https://a.storyblok.com/f/1/x.jpg",
                    gallery: { id: 1 },
                    title: { unexpected: true },
                }),
            ],
            targetSchemas: { page: pageSchema },
        });

        expect(
            summary.groups.map(
                (group) =>
                    `${group.component}.${group.field}: ${group.expected} <- ${group.got}`,
            ),
        ).toEqual([
            "page.body: bloks <- object",
            "page.cta: multilink <- string",
            "page.gallery: multiasset <- object",
            "page.image: asset <- string",
        ]);
        expect(summary.stories).toBe(1);
    });

    it("accepts the shapes each checked type expects", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "page",
                    body: [],
                    cta: { linktype: "url", url: "https://example.com" },
                    image: { id: 1, filename: "x.jpg" },
                    gallery: [],
                }),
            ],
            targetSchemas: { page: pageSchema },
        });

        expect(summary.occurrences).toBe(0);
    });

    it("reads the target schema first and falls back to the source schema", () => {
        const stories = [
            story(1, "a", {
                component: "page",
                body: [
                    { component: "sb-blockquote", content: "quote" },
                    { component: "legacy", note: "text" },
                ],
            }),
        ];

        const summary = findSchemaDrift({
            stories,
            // The target has turned the field into text: a string is fine there.
            targetSchemas: {
                page: pageSchema,
                "sb-blockquote": { content: { type: "text" } },
            },
            // The target lacks `legacy`, so its source schema decides.
            sourceSchemas: {
                "sb-blockquote": blockquoteSchema,
                legacy: { note: { type: "richtext" } },
            },
        });

        expect(summary.groups).toEqual([
            {
                component: "legacy",
                field: "note",
                expected: "richtext",
                got: "string",
                count: 1,
            },
        ]);
    });

    it("finds drift in bloks nested in bloks and in richtext", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "page",
                    body: [
                        {
                            component: "sb-blockquote",
                            content: {
                                type: "doc",
                                content: [
                                    {
                                        type: "blok",
                                        attrs: {
                                            body: [
                                                {
                                                    component: "sb-blockquote",
                                                    content: "nested quote",
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            ],
            targetSchemas: {
                page: pageSchema,
                "sb-blockquote": blockquoteSchema,
            },
        });

        expect(summary.occurrences).toBe(1);
        expect(summary.findings[0]?.path).toBe(
            "content.body[0].content.content[0].attrs.body[0].content",
        );
    });

    it("groups occurrences across stories and lists every story once", () => {
        const quote = (content: unknown) => ({
            component: "sb-blockquote",
            content,
        });
        const summary = findSchemaDrift({
            stories: [
                story(1, "b", {
                    component: "page",
                    body: [quote("x"), quote("y")],
                }),
                story(2, "a", { component: "page", body: [quote("z")] }),
                story(3, "c", { component: "page", body: [quote(doc)] }),
            ],
            targetSchemas: {
                page: pageSchema,
                "sb-blockquote": blockquoteSchema,
            },
        });

        expect(summary.occurrences).toBe(3);
        expect(summary.stories).toBe(2);
        expect(summary.storyFullSlugs).toEqual(["a", "b"]);
        expect(summary.groups).toEqual([
            {
                component: "sb-blockquote",
                field: "content",
                expected: "richtext",
                got: "string",
                count: 3,
            },
        ]);
    });

    it("formats the PLAN line and one line per group", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", {
                    component: "page",
                    cta: "https://example.com",
                    body: [
                        { component: "sb-blockquote", content: "x" },
                        { component: "sb-blockquote", content: "y" },
                    ],
                }),
                story(2, "b", {
                    component: "sb-blockquote",
                    content: "z",
                }),
            ],
            targetSchemas: {
                page: pageSchema,
                "sb-blockquote": blockquoteSchema,
            },
        });

        expect(formatSchemaDriftLines(summary)).toEqual([
            "schema drift: 4 occurrences in 2 stories",
            "  sb-blockquote.content: expected richtext, got string (3)",
            "  page.cta: expected multilink, got string (1)",
        ]);
    });

    it("prints the line with zero when nothing drifted", () => {
        expect(
            formatSchemaDriftLines(
                findSchemaDrift({ stories: [], targetSchemas: {} }),
            ),
        ).toEqual(["schema drift: 0 occurrences in 0 stories"]);
    });

    it("uses singular words for one occurrence in one story", () => {
        const summary = findSchemaDrift({
            stories: [
                story(1, "a", { component: "sb-blockquote", content: "x" }),
            ],
            targetSchemas: { "sb-blockquote": blockquoteSchema },
        });

        expect(formatSchemaDriftLines(summary)[0]).toBe(
            "schema drift: 1 occurrence in 1 story",
        );
    });

    it("counts only schema drift as will fail", () => {
        const schemaDrift = findSchemaDrift({
            stories: [
                story(1, "b", { component: "sb-blockquote", content: "x" }),
                story(2, "a", { component: "sb-blockquote", content: "y" }),
                story(3, "c", { component: "sb-blockquote", content: doc }),
            ],
            targetSchemas: { "sb-blockquote": blockquoteSchema },
        });
        const willFail = summarizeStoriesWillFail({ schemaDrift });

        expect(willFail).toEqual({ stories: 2, storyFullSlugs: ["a", "b"] });
        expect(formatStoriesWillFailLine(willFail)).toBe(
            "will fail: 2 stories (schema drift)",
        );
    });
});
