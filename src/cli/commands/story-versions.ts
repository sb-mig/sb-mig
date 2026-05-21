import type { CLIOptions } from "../../utils/interfaces.js";

import fs from "fs/promises";
import path from "path";

import { managementApi } from "../../api/managementApi.js";
import Logger from "../../utils/logger.js";
import { apiConfig } from "../api-config.js";

const asBoolean = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

const asNumber = (value: unknown, fallback: number) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }

    return fallback;
};

const collectI18nKeys = (value: unknown, keys = new Set<string>()) => {
    if (!value || typeof value !== "object") return keys;

    if (Array.isArray(value)) {
        value.forEach((item) => collectI18nKeys(item, keys));
        return keys;
    }

    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (key.includes("__i18n__")) keys.add(key);
        collectI18nKeys(child, keys);
    });

    return keys;
};

const summariseContent = (content: unknown) => {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
        return {
            hasContent: Boolean(content),
            rootKeys: [],
            rootKeyCount: 0,
            i18nKeyCount: 0,
            i18nKeySamples: [],
        };
    }

    const rootKeys = Object.keys(content as Record<string, unknown>);
    const i18nKeys = [...collectI18nKeys(content)].sort();

    return {
        hasContent: true,
        component: (content as Record<string, unknown>)["component"] ?? null,
        rootKeyCount: rootKeys.length,
        rootKeys: rootKeys.slice(0, 30),
        i18nKeyCount: i18nKeys.length,
        i18nKeySamples: i18nKeys.slice(0, 20),
    };
};

const summariseVersionsResponse = (response: any) => {
    const versions = Array.isArray(response?.story_versions)
        ? response.story_versions
        : [];

    return {
        responseKeys: response ? Object.keys(response) : [],
        versionCount: versions.length,
        statuses: [...new Set(versions.map((version: any) => version.status))],
        versions: versions.map((version: any) => ({
            id: version.id,
            storyId: version.story_id,
            status: version.status ?? null,
            createdAt: version.created_at ?? null,
            publishedAt: version.published_at ?? null,
            releaseId: version.release_id ?? null,
            parentId: version.parent_id ?? null,
            authorId: version.author_id ?? null,
            user: version.user
                ? {
                      id: version.user.id,
                      userid: version.user.userid,
                      friendlyName: version.user.friendly_name,
                  }
                : null,
            content: summariseContent(version.content),
        })),
    };
};

const writeJson = async (outputPath: string, payload: unknown) => {
    const absolutePath = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(process.cwd(), outputPath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, {
        flag: "w",
    });

    Logger.success(`Wrote story versions output to ${absolutePath}`);
};

export const storyVersions = async ({ flags }: CLIOptions) => {
    const from = flags["from"] as string | undefined;
    const storyIdFlag = flags["storyId"] as string | undefined;
    const withSlug = flags["withSlug"] as string | undefined;
    const outputPath = flags["outputPath"] as string | undefined;
    const raw = asBoolean(flags["raw"], false);
    const showContent = asBoolean(flags["showContent"], true);
    const page = asNumber(flags["page"], 1);
    const perPage = asNumber(flags["perPage"], 25);

    if (!from) {
        Logger.error("--from is required.");
        process.exitCode = 1;
        return;
    }

    if (!storyIdFlag && !withSlug) {
        Logger.error("Pass either --storyId or --withSlug.");
        process.exitCode = 1;
        return;
    }

    const config = { ...apiConfig, spaceId: from };
    const storyId =
        storyIdFlag ??
        (await managementApi.stories.getStoryBySlug(withSlug as string, config))
            ?.story?.id;

    if (!storyId) {
        Logger.error(`Could not resolve story id from '${withSlug}'.`);
        const searchTerm = withSlug?.split("/").at(-1) ?? withSlug;
        const matches = searchTerm
            ? await managementApi.stories.searchStorySlugs(
                  { search: searchTerm, perPage: 10 },
                  config,
              )
            : [];

        if (matches.length > 0) {
            Logger.warning("Closest stories returned by Storyblok search:");
            matches.forEach((story: any) => {
                console.log(
                    JSON.stringify(
                        {
                            id: story.id,
                            name: story.name,
                            slug: story.slug,
                            full_slug: story.full_slug,
                            is_folder: story.is_folder,
                        },
                        null,
                        2,
                    ),
                );
            });
        }

        process.exitCode = 1;
        return;
    }

    const response = await managementApi.stories.getStoryVersions(
        {
            storyId,
            showContent,
            page,
            perPage,
        },
        config,
    );

    const payload = raw ? response : summariseVersionsResponse(response);

    if (outputPath) {
        await writeJson(outputPath, payload);
        return;
    }

    console.log(JSON.stringify(payload, null, 2));
};
