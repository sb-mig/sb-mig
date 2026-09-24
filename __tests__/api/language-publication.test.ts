import { describe, expect, it } from "vitest";

import {
    classifyTranslatedLanguage,
    countLanguagePlans,
    formatLanguagePlanLine,
    planStoryLanguages,
} from "../../src/api/copy/language-publication.js";

/**
 * The `translated_stories` shapes, exactly as measured on the sandbox target
 * with `use_translated_stories` on (MAR-3076 §8, re-measured by the horse).
 */
const measured = {
    A_created: { published: false, unpublished_changes: false, translated_stories: [] },
    B_published_default_and_de: {
        published: true,
        unpublished_changes: false,
        translated_stories: [
            { lang: "de", published_at: "2026-09-24T08:00:00Z", unpublished_changes: false },
        ],
    },
    C_de_edited: {
        published: true,
        unpublished_changes: true,
        translated_stories: [
            { lang: "de", published_at: "2026-09-24T08:00:00Z", unpublished_changes: true },
        ],
    },
    D_default_edited_de_restored_sticky: {
        published: true,
        unpublished_changes: true,
        translated_stories: [
            { lang: "de", published_at: "2026-09-24T08:00:00Z", unpublished_changes: true },
        ],
    },
    E_de_unpublished: { published: true, unpublished_changes: true, translated_stories: [] },
};

describe("classifyTranslatedLanguage — the measured shapes (MAR-3076 R2)", () => {
    // R2 canary. Mutation that must turn it red: treat a missing entry as
    // published.
    it.each([
        ["A: created, never published", "not_published", measured.A_created],
        ["B: published", "published_clean", measured.B_published_default_and_de],
        ["C: edited after publishing", "published_with_unpublished_changes", measured.C_de_edited],
        ["D: edited back, still dirty (sticky)", "published_with_unpublished_changes", measured.D_default_edited_de_restored_sticky],
        ["E: unpublished again, entry removed", "not_published", measured.E_de_unpublished],
    ])("%s → de is %s", (_step, expected, story) => {
        expect(classifyTranslatedLanguage(story, "de")).toBe(expected);
    });

    it("reads a language the story has no entry for as not published", () => {
        expect(
            classifyTranslatedLanguage(measured.B_published_default_and_de, "pl"),
        ).toBe("not_published");
    });

    it("reads an entry that does not say its state as dirty, never as clean", () => {
        expect(
            classifyTranslatedLanguage(
                { translated_stories: [{ lang: "de" }] },
                "de",
            ),
        ).toBe("published_with_unpublished_changes");
    });
});

describe("planStoryLanguages — which languages a publish takes (MAR-3076 R3)", () => {
    /** [default] clean, de clean, pl never published, fr dirty. */
    const story = {
        published: true,
        unpublished_changes: false,
        translated_stories: [
            { lang: "de", unpublished_changes: false },
            { lang: "fr", unpublished_changes: true },
        ],
    };
    const languages = ["[default]", "de", "pl", "fr"];

    // R3 canary. Mutations that must turn it red: publish the whole resolved
    // set; publish a dirty translation outside the published-layer path.
    it("keeps only live, clean translations on a normal publish", () => {
        expect(
            planStoryLanguages({ story, languages, layerPath: false, perLanguage: true }),
        ).toEqual({
            publish: ["[default]", "de"],
            left: [
                { code: "pl", state: "not_published" },
                { code: "fr", state: "published_with_unpublished_changes" },
            ],
        });
    });

    it("publishes a dirty translation only on the published-layer path", () => {
        expect(
            planStoryLanguages({ story, languages, layerPath: true, perLanguage: true }),
        ).toEqual({
            publish: ["[default]", "de", "fr"],
            left: [{ code: "pl", state: "not_published" }],
        });
    });

    it("publishes every language together when the space does", () => {
        expect(
            planStoryLanguages({ story, languages, layerPath: false, perLanguage: false }),
        ).toEqual({ publish: languages, left: [] });
    });
});

describe("the languages line (MAR-3076 R4)", () => {
    it("counts stories and translations the way it reads", () => {
        const counts = countLanguagePlans([
            { publish: ["[default]", "de"], left: [] },
            {
                publish: ["[default]"],
                left: [
                    { code: "pl", state: "not_published" },
                    { code: "fr", state: "published_with_unpublished_changes" },
                ],
            },
            { publish: ["[default]"], left: [{ code: "pl", state: "not_published" }] },
        ]);

        expect(counts).toEqual({
            allLive: 1,
            storiesKeepingUnpublished: 2,
            unpublishedTranslations: 2,
            dirtyLeft: 1,
        });
        expect(formatLanguagePlanLine(counts)).toBe(
            "languages: 1 stories publish in all their live languages; 2 stories keep 2 unpublished translation(s) unpublished; 1 translation(s) with unpublished changes left as they are",
        );
    });
});
