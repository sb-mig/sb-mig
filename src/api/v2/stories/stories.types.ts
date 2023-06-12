import type { RequestBaseConfig } from "../utils/request.js";

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
export type GetAllStories = (config: RequestBaseConfig) => Promise<any>;

export type CreateStory = (
    content: any,
    config: RequestBaseConfig
) => Promise<any>;
export type UpdateStory = (
    content: any,
    storyId: string,
    options: { publish?: boolean },
    config: RequestBaseConfig
) => Promise<any>;
export type UpdateStories = (
    args: { stories: any; options: { publish?: boolean }; spaceId: string },
    config: RequestBaseConfig
) => Promise<any>;

export type BackupStories = (
    args: { filename: string; spaceId: string; suffix?: string },
    config: RequestBaseConfig
) => void;
