/**
 * Which languages of a story a copy publishes (MAR-3076).
 *
 * Storyblok publishes a story's languages one by one only when the space has
 * `use_translated_stories` on ("publish translations individually"). Then the
 * Management story itself says, in `translated_stories`, which translations
 * are live (measured on a sandbox, 2026-09-24):
 *
 * - never published, or unpublished again → no entry
 * - published → an entry with `unpublished_changes: false`
 * - edited after publishing → an entry with `unpublished_changes: true`, and
 *   the flag stays true even when the text is edited back (it is sticky)
 *
 * With the setting off, a publish takes every language at once, so there is
 * nothing to choose and a copy publishes as it always has.
 */
export type TranslatedLanguageState =
    | "published_clean"
    | "published_with_unpublished_changes"
    | "not_published";

/** The code Storyblok's publish endpoint takes for the default language. */
export const DEFAULT_LANGUAGE_CODE = "[default]";

/**
 * The state of one translation, read from the story it belongs to. No entry
 * is "not published". An entry that does not say whether it has unpublished
 * changes is read as having them: nothing unfinished goes live on a guess.
 */
export const classifyTranslatedLanguage = (
    story: any,
    code: string,
): TranslatedLanguageState => {
    const entries = Array.isArray(story?.translated_stories)
        ? story.translated_stories
        : [];
    const entry = entries.find((candidate: any) => candidate?.lang === code);

    if (!entry) {
        return "not_published";
    }

    return entry.unpublished_changes === false
        ? "published_clean"
        : "published_with_unpublished_changes";
};

export type LeftLanguage = { code: string; state: TranslatedLanguageState };

export type StoryLanguagePlan = {
    /** The languages the publish call carries. */
    publish: string[];
    /** The languages it leaves as they are, each with why. */
    left: LeftLanguage[];
};

/**
 * The languages one story's publish takes, from the resolved publish set.
 *
 * - `[default]` follows the story-level decision the caller already made.
 * - A clean translation is published.
 * - A translation with unpublished changes is published only when the content
 *   being published is its published layer (`layerPath`); anywhere else its
 *   draft would go live, so it is left.
 * - A translation that is not published stays that way.
 *
 * Filtering needs both answers to be "per language": the space published
 * INTO must publish translations individually, and the story the state is
 * read from must come from a space that does too — a story from a space that
 * publishes all languages together has no `translated_stories`, and every
 * language of it is live when it is published.
 */
export const planStoryLanguages = ({
    story,
    languages,
    layerPath,
    perLanguage,
}: {
    story: any;
    languages: string[];
    layerPath: boolean;
    perLanguage: boolean;
}): StoryLanguagePlan => {
    if (!perLanguage) {
        return { publish: [...languages], left: [] };
    }

    const publish: string[] = [];
    const left: LeftLanguage[] = [];

    for (const code of languages) {
        if (code === DEFAULT_LANGUAGE_CODE) {
            publish.push(code);
            continue;
        }

        const state = classifyTranslatedLanguage(story, code);

        if (
            state === "published_clean" ||
            (state === "published_with_unpublished_changes" && layerPath)
        ) {
            publish.push(code);
        } else {
            left.push({ code, state });
        }
    }

    return { publish, left };
};

export type LanguagePlanCounts = {
    /** Stories published in every language that was live. */
    allLive: number;
    /** Stories that keep at least one unpublished translation unpublished. */
    storiesKeepingUnpublished: number;
    /** The unpublished translations those stories keep. */
    unpublishedTranslations: number;
    /** Translations with unpublished changes, left as they are. */
    dirtyLeft: number;
};

export const countLanguagePlans = (
    plans: StoryLanguagePlan[],
): LanguagePlanCounts => {
    const counts: LanguagePlanCounts = {
        allLive: 0,
        storiesKeepingUnpublished: 0,
        unpublishedTranslations: 0,
        dirtyLeft: 0,
    };

    for (const plan of plans) {
        const unpublished = plan.left.filter(
            (entry) => entry.state === "not_published",
        ).length;
        const dirty = plan.left.length - unpublished;

        if (plan.left.length === 0) {
            counts.allLive += 1;
        }

        if (unpublished > 0) {
            counts.storiesKeepingUnpublished += 1;
            counts.unpublishedTranslations += unpublished;
        }

        counts.dirtyLeft += dirty;
    }

    return counts;
};

/** The PLAN line for a space that publishes translations individually. */
export const formatLanguagePlanLine = (counts: LanguagePlanCounts): string =>
    `languages: ${counts.allLive} stories publish in all their live languages; ${counts.storiesKeepingUnpublished} stories keep ${counts.unpublishedTranslations} unpublished translation(s) unpublished; ${counts.dirtyLeft} translation(s) with unpublished changes left as they are`;

/** The PLAN line for a space that publishes every language at once. */
export const LANGUAGES_ALL_TOGETHER_LINE =
    "languages: this space publishes all languages together (use_translated_stories off) — a published story goes live in every language";

/**
 * The reason a relinked story with unpublished changes and no published
 * version is listed, when translations publish individually: the story-level
 * flag turns on for a translation's edit too, so it cannot say which part.
 */
export const DIRTY_ANY_LANGUAGE_REASON =
    "dirty (a translation or the default language has unpublished changes)";
