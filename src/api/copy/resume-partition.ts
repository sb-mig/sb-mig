import type { CopyStoryContentManifestEntry } from "./types.js";

export type ResumePartition = {
    fastPathSourceIds: Set<number>;
    needsContentIds: Set<number>;
};

export const partitionStoriesForResume = ({
    listStories,
    checkpoints,
    verify,
    forceContent,
}: {
    listStories: any[];
    checkpoints: Map<number, CopyStoryContentManifestEntry>;
    verify: boolean;
    forceContent: boolean;
}): ResumePartition => {
    const fastPathSourceIds = new Set<number>();
    const needsContentIds = new Set<number>();

    for (const story of listStories) {
        const sourceId = Number(story.id);
        const checkpoint = checkpoints.get(sourceId);
        const eligible =
            !verify &&
            !forceContent &&
            checkpoint !== undefined &&
            checkpoint.unresolved_refs === 0 &&
            checkpoint.source_updated_at !== undefined &&
            checkpoint.source_updated_at === story.updated_at;

        (eligible ? fastPathSourceIds : needsContentIds).add(sourceId);
    }

    return { fastPathSourceIds, needsContentIds };
};
