/**
 * A story's translated slug, in the shape the Management API accepts back.
 *
 * Storyblok READS translated slugs as `translated_slugs` and WRITES them as
 * `translated_slugs_attributes`; a `translated_slugs` key on a write is
 * accepted and ignored, which is exactly how a copy loses them without a word.
 */
export type CopyTranslatedSlug = {
    lang: string;
    slug: string;
    name: string | null;
};

export type CopyTranslatedSlugPlan = {
    /** Slugs this run will write into the target story. */
    carried: CopyTranslatedSlug[];
    /**
     * Slugs whose language the target space does not have. They are left
     * behind rather than sent: the API refuses a write in an unknown language,
     * and failing the whole story would be a heavier answer than the ticket
     * asks for.
     */
    unsupported: CopyTranslatedSlug[];
};

export type CopyTranslatedSlugSummary = {
    /** Stories carrying at least one translated slug into the target. */
    stories: number;
    /** Translated slugs written across those stories. */
    carried: number;
    /** Translated slugs left behind for want of a language. */
    unsupported: number;
    /** The languages that were missing, sorted, each named once. */
    unsupportedLangs: string[];
};

/**
 * The translated slugs of one source story, split into what the target space
 * can take and what it cannot.
 *
 * `targetLanguageCodes` undefined means the languages could not be read. An
 * unknown language list is not the same as an empty one, so nothing is dropped
 * on a guess: everything is carried and the API has the last word.
 */
export const planStoryTranslatedSlugs = ({
    story,
    targetLanguageCodes,
}: {
    story: any;
    targetLanguageCodes?: string[];
}): CopyTranslatedSlugPlan => {
    const source = Array.isArray(story?.translated_slugs)
        ? story.translated_slugs
        : [];
    const supported = targetLanguageCodes
        ? new Set(targetLanguageCodes)
        : undefined;
    const carried: CopyTranslatedSlug[] = [];
    const unsupported: CopyTranslatedSlug[] = [];
    const seenLangs = new Set<string>();

    for (const entry of source) {
        const lang = String(entry?.lang ?? "").trim();
        const slug = String(entry?.slug ?? "").trim();

        // A slug without a language cannot be addressed and a language without
        // a slug carries nothing; the source's own ids belong to the source.
        if (!lang || !slug || seenLangs.has(lang)) {
            continue;
        }

        seenLangs.add(lang);

        const translatedSlug: CopyTranslatedSlug = {
            lang,
            slug,
            name: typeof entry?.name === "string" ? entry.name : null,
        };

        if (supported && !supported.has(lang)) {
            unsupported.push(translatedSlug);
            continue;
        }

        carried.push(translatedSlug);
    }

    return { carried, unsupported };
};

/** The same accounting across every story a run plans to write. */
export const summarizeCopyTranslatedSlugs = ({
    stories,
    targetLanguageCodes,
}: {
    stories: any[];
    targetLanguageCodes?: string[];
}): CopyTranslatedSlugSummary => {
    const unsupportedLangs = new Set<string>();
    let storiesWithSlugs = 0;
    let carried = 0;
    let unsupported = 0;

    for (const story of stories) {
        const plan = planStoryTranslatedSlugs({ story, targetLanguageCodes });

        if (plan.carried.length > 0) {
            storiesWithSlugs += 1;
            carried += plan.carried.length;
        }

        unsupported += plan.unsupported.length;
        plan.unsupported.forEach((slug) => unsupportedLangs.add(slug.lang));
    }

    return {
        stories: storiesWithSlugs,
        carried,
        unsupported,
        unsupportedLangs: Array.from(unsupportedLangs).sort(),
    };
};

const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;

/**
 * What a PLAN or a dry run says about translated slugs. Nothing at all when
 * there are none: a space without translated slugs should not have to read a
 * line about them before every copy.
 */
export const describeCopyTranslatedSlugs = ({
    summary,
    targetSpaceId,
}: {
    summary: CopyTranslatedSlugSummary;
    targetSpaceId: string;
}): string[] => {
    if (summary.carried === 0 && summary.unsupported === 0) {
        return [];
    }

    const lines = [
        `translated slugs: ${summary.carried} carried across ${summary.stories} ${plural(summary.stories, "story", "stories")}`,
    ];

    if (summary.unsupported > 0) {
        lines.push(
            `${summary.unsupported} translated ${plural(summary.unsupported, "slug is", "slugs are")} left behind: space ${targetSpaceId} has no ${plural(summary.unsupportedLangs.length, "language", "languages")} ${summary.unsupportedLangs.join(", ")}.`,
        );
    }

    return lines;
};

/**
 * The one warning a run has to give about translated slugs, in the shape a
 * report carries and the console prints. Built once so the JSON artifact and
 * the terminal cannot drift into two different accounts of the same loss.
 */
export const buildCopyTranslatedSlugsWarning = ({
    summary,
    targetSpaceId,
}: {
    summary: CopyTranslatedSlugSummary;
    targetSpaceId: string;
}): { code: string; message: string } | undefined => {
    if (summary.unsupported === 0) {
        return undefined;
    }

    return {
        code: "translated_slugs_unsupported_language",
        message: `${summary.unsupported} translated slug(s) will be left behind: space '${targetSpaceId}' has no language(s) ${summary.unsupportedLangs.join(", ")}. Add them to the target space and copy again to carry them.`,
    };
};
