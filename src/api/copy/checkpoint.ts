import type {
    CopyManifestEntry,
    CopyStoryContentManifestEntry,
} from "./types.js";

import crypto from "crypto";

const stableStringify = (value: any): string | undefined => {
    if (Array.isArray(value)) {
        return `[${value
            .map((item) => stableStringify(item) ?? "null")
            .join(",")}]`;
    }
    if (value && typeof value === "object") {
        const parts: string[] = [];
        for (const key of Object.keys(value).sort()) {
            const encoded = stableStringify(value[key]);
            if (encoded !== undefined) {
                parts.push(`${JSON.stringify(key)}:${encoded}`);
            }
        }
        return `{${parts.join(",")}}`;
    }
    return JSON.stringify(value);
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
    const canonical =
        stableStringify({
            payload,
            publicationMode,
            publishLanguages: [...(publishLanguages ?? [])].sort(),
        }) ?? "null";

    return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
};

const isStoryContentManifestEntry = (
    entry: CopyManifestEntry,
): entry is CopyStoryContentManifestEntry => entry.type === "story_content";

export const buildContentCheckpointMap = (
    entries: CopyManifestEntry[],
): Map<number, CopyStoryContentManifestEntry> => {
    const map = new Map<number, CopyStoryContentManifestEntry>();

    for (const entry of entries) {
        if (isStoryContentManifestEntry(entry)) {
            map.set(Number(entry.source_id), entry);
        }
    }

    return map;
};
