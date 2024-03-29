import type { RequestBaseConfig } from "../utils/request.js";
import type { ISbStoriesParams } from "storyblok-js-client";

export interface ExtendedISbStoriesParams extends ISbStoriesParams {
    with_slug?: string;
}

interface ModifyStoryOptions {
    publish?: boolean;
    force_update?: boolean;
}

export type RemoveStory = (
    args: { storyId: string },
    config: RequestBaseConfig
) => Promise<any>;

export type RemoveAllStories = (config: RequestBaseConfig) => Promise<any>;

export type GetStoryById = (
    storyId: string,
    config: RequestBaseConfig
) => Promise<any>;

export type GetStoryBySlug = (
    slug: string,
    config: RequestBaseConfig
) => Promise<any>;

export type GetAllStories = (
    args: { options?: ExtendedISbStoriesParams },
    config: RequestBaseConfig
) => Promise<any>;

export type CreateStory = (
    content: any,
    config: RequestBaseConfig
) => Promise<any>;

export type UpdateStory = (
    content: any,
    storyId: string,
    options: ModifyStoryOptions,
    config: RequestBaseConfig
) => Promise<any>;

export type UpdateStories = (
    args: { stories: any; options: ModifyStoryOptions; spaceId: string },
    config: RequestBaseConfig
) => Promise<any>;

export type UpsertStory = (
    args: {
        content: any;
        storyId?: string;
        storySlug?: string;
    },
    config: RequestBaseConfig
) => void;

export type DeepUpsertStory = (
    args: {
        content: any;
        storyId?: string;
        storySlug?: string;
    },
    config: RequestBaseConfig
) => void;

export type BackupStories = (
    args: { filename: string; spaceId: string; suffix?: string },
    config: RequestBaseConfig
) => void;
