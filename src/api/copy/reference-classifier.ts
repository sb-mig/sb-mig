import type {
    CopyGraphStoryNode,
    CopyGraphStoryReference,
    CopyMaps,
    CopyStoryReferenceStatus,
} from "./types.js";

/**
 * The set of source stories a copy run is about to write. Built from the copy
 * plan, so a reference pointing into it is guaranteed to have a mapping by the
 * time phase 2 rewrites content.
 */
export type CopyReferenceSelection = {
    storyIds: Set<number>;
    storyUuids: Set<string>;
};

export type CopyStoryReferenceStatusCounts = {
    willRelink: number;
    willBreak: number;
    externalKept: number;
    unresolved: number;
    unsupported: number;
    unclassified: number;
};

export type CopyBrokenStoryReferenceGroup = {
    sourceStoryFullSlug: string;
    references: CopyGraphStoryReference[];
};

/**
 * `parent_id` is resolved by the copy plan itself: phase 1 creates every shell
 * under its planned parent, and the top of the selection lands under the
 * destination. It cannot dangle the way a content reference can, so it is
 * never reported as a break — even when the source parent is out of scope.
 */
const STRUCTURAL_REFERENCE_PATHS = new Set(["parent_id"]);

/**
 * `excludeSourceFullSlugs` names planned stories the run will NOT map. `copy
 * stories` creates every planned story, so it excludes nothing; `copy relink`
 * never creates, so a reference into a story missing from the target has to
 * classify as a break rather than a promise to relink.
 */
export const buildCopyReferenceSelection = (
    stories: CopyGraphStoryNode[],
    {
        excludeSourceFullSlugs,
    }: { excludeSourceFullSlugs?: ReadonlySet<string> } = {},
): CopyReferenceSelection => {
    const storyIds = new Set<number>();
    const storyUuids = new Set<string>();

    for (const story of stories) {
        if (excludeSourceFullSlugs?.has(story.sourceFullSlug)) {
            continue;
        }

        // Plan items whose source story could not be resolved carry sourceId 0.
        if (Number.isFinite(story.sourceId) && story.sourceId > 0) {
            storyIds.add(story.sourceId);
        }

        if (story.sourceUuid) {
            storyUuids.add(story.sourceUuid);
        }
    }

    return { storyIds, storyUuids };
};

export const createEmptyCopyReferenceSelection =
    (): CopyReferenceSelection => ({
        storyIds: new Set(),
        storyUuids: new Set(),
    });

const isInSelection = (
    reference: CopyGraphStoryReference,
    selection: CopyReferenceSelection,
): boolean =>
    (reference.referencedStoryId !== undefined &&
        selection.storyIds.has(reference.referencedStoryId)) ||
    (reference.referencedStoryUuid !== undefined &&
        selection.storyUuids.has(reference.referencedStoryUuid));

const isInLedger = (
    reference: CopyGraphStoryReference,
    copyMaps: CopyMaps,
): boolean =>
    (reference.referencedStoryId !== undefined &&
        copyMaps.storyIds.has(reference.referencedStoryId)) ||
    (reference.referencedStoryUuid !== undefined &&
        copyMaps.storyUuids.has(reference.referencedStoryUuid));

export const classifyStoryReferenceStatus = ({
    reference,
    selection,
    copyMaps,
    sameSpace,
}: {
    reference: CopyGraphStoryReference;
    selection: CopyReferenceSelection;
    copyMaps: CopyMaps;
    sameSpace: boolean;
}): CopyStoryReferenceStatus => {
    // The scanner already decided these; the copy plan cannot improve on them.
    if (
        reference.status === "unresolved" ||
        reference.status === "unsupported"
    ) {
        return reference.status;
    }

    if (STRUCTURAL_REFERENCE_PATHS.has(reference.path)) {
        return "will_relink";
    }

    if (
        isInSelection(reference, selection) ||
        isInLedger(reference, copyMaps)
    ) {
        return "will_relink";
    }

    return sameSpace ? "external_kept" : "will_break";
};

export const classifyStoryReferences = ({
    storyReferences,
    selection,
    copyMaps,
    sameSpace,
}: {
    storyReferences: CopyGraphStoryReference[];
    selection: CopyReferenceSelection;
    copyMaps: CopyMaps;
    sameSpace: boolean;
}): CopyGraphStoryReference[] =>
    storyReferences.map((reference) => ({
        ...reference,
        status: classifyStoryReferenceStatus({
            reference,
            selection,
            copyMaps,
            sameSpace,
        }),
    }));

export const countStoryReferenceStatuses = (
    storyReferences: CopyGraphStoryReference[],
): CopyStoryReferenceStatusCounts => {
    const counts: CopyStoryReferenceStatusCounts = {
        willRelink: 0,
        willBreak: 0,
        externalKept: 0,
        unresolved: 0,
        unsupported: 0,
        unclassified: 0,
    };

    for (const reference of storyReferences) {
        switch (reference.status) {
            case "will_relink":
                counts.willRelink += 1;
                break;
            case "will_break":
                counts.willBreak += 1;
                break;
            case "external_kept":
                counts.externalKept += 1;
                break;
            case "unresolved":
                counts.unresolved += 1;
                break;
            case "unsupported":
                counts.unsupported += 1;
                break;
            default:
                counts.unclassified += 1;
                break;
        }
    }

    return counts;
};

/**
 * Groups the references that will dangle by the story that holds them, so the
 * report can name a story once and list its offending field paths under it.
 */
export const groupBrokenStoryReferences = (
    storyReferences: CopyGraphStoryReference[],
): CopyBrokenStoryReferenceGroup[] => {
    const groups = new Map<string, CopyBrokenStoryReferenceGroup>();

    for (const reference of storyReferences) {
        if (reference.status !== "will_break") {
            continue;
        }

        const sourceStoryFullSlug =
            reference.sourceStoryFullSlug ??
            (reference.sourceStoryId !== undefined
                ? `#${reference.sourceStoryId}`
                : "<unknown story>");
        const group = groups.get(sourceStoryFullSlug) ?? {
            sourceStoryFullSlug,
            references: [],
        };

        group.references.push(reference);
        groups.set(sourceStoryFullSlug, group);
    }

    return Array.from(groups.values());
};

export const describeBrokenStoryReferenceTarget = (
    reference: CopyGraphStoryReference,
): string =>
    reference.referencedStoryUuid ??
    (reference.referencedStoryId !== undefined
        ? `#${reference.referencedStoryId}`
        : "<unknown target>");
