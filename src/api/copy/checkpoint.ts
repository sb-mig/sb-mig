import type {
    CopyManifestEntry,
    CopyStoryContentManifestEntry,
} from "./types.js";

import crypto from "crypto";

const stableStringify = (value: any): string => {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableStringify(value[key])}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
};

export const computeContentHash = ({
    payload,
    publicationMode,
    publishLanguages,
}: {
    payload: any;
    publicationMode: string;
    publishLanguages?: string[];
}): string => {
    const canonical = stableStringify({
        payload,
        publicationMode,
        publishLanguages: [...(publishLanguages ?? [])].sort(),
    });

    return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
};

export const buildContentCheckpointMap = (
    entries: CopyManifestEntry[],
): Map<number, CopyStoryContentManifestEntry> => {
    const map = new Map<number, CopyStoryContentManifestEntry>();

    for (const entry of entries) {
        if ((entry as any).type === "story_content") {
            const checkpoint = entry as CopyStoryContentManifestEntry;
            map.set(Number(checkpoint.source_id), checkpoint);
        }
    }

    return map;
};
