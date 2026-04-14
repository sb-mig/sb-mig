export const sanitizeOutputFileBaseName = (value: string): string => {
    const sanitized = value
        .trim()
        .replace(/[\\/]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");

    return sanitized || "migration-output";
};

export const resolveOutputFileBaseName = ({
    from,
    fileName,
}: {
    from: string;
    fileName?: string;
}): string => {
    if (typeof fileName === "string" && fileName.trim().length > 0) {
        return sanitizeOutputFileBaseName(fileName);
    }

    return sanitizeOutputFileBaseName(from);
};

export const shouldUseDatestampForArtifacts = (fileName?: string): boolean =>
    !(typeof fileName === "string" && fileName.trim().length > 0);

export const buildPreMigrationBackupBaseName = ({
    from,
    fileName,
}: {
    from: string;
    fileName?: string;
}): string => `before__${resolveOutputFileBaseName({ from, fileName })}`;

export const buildStoryBackupBaseName = ({
    from,
    fileName,
}: {
    from: string;
    fileName?: string;
}): string =>
    `${resolveOutputFileBaseName({ from, fileName })}--backup-before-migration`;
