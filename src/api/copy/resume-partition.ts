import type { CopyStoryContentManifestEntry } from "./types.js";

export type ResumePartition = {
    fastPathSourceIds: Set<number>;
    needsContentIds: Set<number>;
};

const sortedArraysEqual = (
    a: string[] | undefined,
    b: string[] | undefined,
): boolean => {
    if (a === undefined && b === undefined) {
        return true;
    }

    if (a === undefined || b === undefined) {
        return false;
    }

    if (a.length !== b.length) {
        return false;
    }

    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    return sortedA.every((value, index) => value === sortedB[index]);
};

export const partitionStoriesForResume = ({
    listStories,
    checkpoints,
    verify,
    forceContent,
    publicationMode,
    publishLanguages,
    targetFullSlugBySourceId,
    mappedSourceIds,
}: {
    listStories: any[];
    checkpoints: Map<number, CopyStoryContentManifestEntry>;
    verify: boolean;
    forceContent: boolean;
    // Gate identity (Task 10 hardening): the fast path is only trusted
    // when the checkpoint's publication_mode/publish_languages/
    // target_full_slug all match the CURRENT run's values -- a mode
    // change, a language-set change, or a destination change must all
    // disable it.
    publicationMode: string;
    publishLanguages?: string[];
    targetFullSlugBySourceId: Map<number, string>;
    // A checkpoint without its own "story" shell mapping must never
    // fast-path (would otherwise leave an empty shell with no content
    // written, forever, since the fast path skips the write entirely).
    mappedSourceIds: Set<number>;
}): ResumePartition => {
    const fastPathSourceIds = new Set<number>();
    const needsContentIds = new Set<number>();

    for (const story of listStories) {
        const sourceId = Number(story.id);
        const checkpoint = checkpoints.get(sourceId);
        const plannedTargetFullSlug = targetFullSlugBySourceId.get(sourceId);
        const eligible =
            !verify &&
            !forceContent &&
            checkpoint !== undefined &&
            checkpoint.unresolved_refs === 0 &&
            checkpoint.source_updated_at !== undefined &&
            checkpoint.source_updated_at === story.updated_at &&
            checkpoint.publication_mode !== undefined &&
            checkpoint.publication_mode === publicationMode &&
            sortedArraysEqual(checkpoint.publish_languages, publishLanguages) &&
            checkpoint.target_full_slug !== undefined &&
            plannedTargetFullSlug !== undefined &&
            checkpoint.target_full_slug === plannedTargetFullSlug &&
            mappedSourceIds.has(sourceId);

        (eligible ? fastPathSourceIds : needsContentIds).add(sourceId);
    }

    return { fastPathSourceIds, needsContentIds };
};
