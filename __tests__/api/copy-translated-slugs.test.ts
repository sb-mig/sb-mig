import { describe, expect, it } from "vitest";

import {
    describeCopyTranslatedSlugs,
    planStoryTranslatedSlugs,
    summarizeCopyTranslatedSlugs,
} from "../../src/api/copy/index.js";

const storyWithSlugs = (translated_slugs: unknown[]) => ({
    id: 2,
    name: "Post 1",
    full_slug: "blog/post-1",
    translated_slugs,
});

describe("copy translated slugs", () => {
    describe("planStoryTranslatedSlugs", () => {
        it("maps the read shape onto the write shape and drops the source ids", () => {
            const plan = planStoryTranslatedSlugs({
                story: storyWithSlugs([
                    {
                        id: 555,
                        story_id: 2,
                        lang: "de",
                        slug: "seite-eins",
                        name: "Seite Eins",
                    },
                    { id: 556, lang: "pl", slug: "strona-jeden", name: null },
                ]),
                targetLanguageCodes: ["de", "pl"],
            });

            // The target space assigns its own ids; carrying the source's
            // would address rows that belong to another space.
            expect(plan.carried).toEqual([
                { lang: "de", slug: "seite-eins", name: "Seite Eins" },
                { lang: "pl", slug: "strona-jeden", name: null },
            ]);
            expect(plan.unsupported).toEqual([]);
        });

        it("leaves behind a slug in a language the target space does not have", () => {
            const plan = planStoryTranslatedSlugs({
                story: storyWithSlugs([
                    { lang: "de", slug: "seite-eins" },
                    { lang: "fr", slug: "page-une" },
                ]),
                targetLanguageCodes: ["de"],
            });

            expect(plan.carried).toEqual([
                { lang: "de", slug: "seite-eins", name: null },
            ]);
            expect(plan.unsupported).toEqual([
                { lang: "fr", slug: "page-une", name: null },
            ]);
        });

        it("carries everything when the target languages could not be read", () => {
            // An unknown language list is not an empty one, so nothing is
            // dropped on a guess.
            const plan = planStoryTranslatedSlugs({
                story: storyWithSlugs([{ lang: "fr", slug: "page-une" }]),
            });

            expect(plan.carried).toHaveLength(1);
            expect(plan.unsupported).toEqual([]);
        });

        it("ignores entries that cannot address anything, and repeats", () => {
            const plan = planStoryTranslatedSlugs({
                story: storyWithSlugs([
                    { lang: "de", slug: "" },
                    { lang: "", slug: "page-une" },
                    { lang: "pl", slug: "strona-jeden" },
                    { lang: "pl", slug: "strona-druga" },
                ]),
            });

            expect(plan.carried).toEqual([
                { lang: "pl", slug: "strona-jeden", name: null },
            ]);
        });

        it("treats a story without translated slugs as nothing to do", () => {
            expect(planStoryTranslatedSlugs({ story: { id: 2 } })).toEqual({
                carried: [],
                unsupported: [],
            });
        });
    });

    describe("summarizeCopyTranslatedSlugs", () => {
        it("counts the slugs, the stories holding them and the missing languages", () => {
            const summary = summarizeCopyTranslatedSlugs({
                stories: [
                    storyWithSlugs([
                        { lang: "de", slug: "seite-eins" },
                        { lang: "fr", slug: "page-une" },
                    ]),
                    storyWithSlugs([{ lang: "de", slug: "seite-zwei" }]),
                    storyWithSlugs([{ lang: "es", slug: "pagina-tres" }]),
                    { id: 9, name: "Folder" },
                ],
                targetLanguageCodes: ["de"],
            });

            expect(summary).toEqual({
                stories: 2,
                carried: 2,
                unsupported: 2,
                unsupportedLangs: ["es", "fr"],
            });
        });
    });

    describe("describeCopyTranslatedSlugs", () => {
        it("states what is carried and names every language left behind", () => {
            expect(
                describeCopyTranslatedSlugs({
                    summary: {
                        stories: 2,
                        carried: 3,
                        unsupported: 2,
                        unsupportedLangs: ["es", "fr"],
                    },
                    targetSpaceId: "222",
                }),
            ).toEqual([
                "translated slugs: 3 carried across 2 stories",
                "2 translated slugs are left behind: space 222 has no languages es, fr.",
            ]);
        });

        it("says nothing at all when there are no translated slugs", () => {
            // A space without translated slugs should not read a line about
            // them before every copy.
            expect(
                describeCopyTranslatedSlugs({
                    summary: {
                        stories: 0,
                        carried: 0,
                        unsupported: 0,
                        unsupportedLangs: [],
                    },
                    targetSpaceId: "222",
                }),
            ).toEqual([]);
        });
    });
});
