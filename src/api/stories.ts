import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";

const { spaceId, boilerplateSpaceId } = storyblokConfig;

// DELETE
export const removeStory = ({
    spaceId,
    storyId,
}: {
    spaceId: number;
    storyId: number;
}) => {
    return sbApi
        .delete(`spaces/${spaceId}/stories/${storyId}`, {})
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

// GET
export const getAllStories = async ({ spaceId }: { spaceId: number }) => {
    console.log("Trying to get all Stories.");

    const allStoriesWithoutContent: any = await sbApi
        .get(`spaces/${spaceId}/stories/`)
        .then((res: any) => res.data.stories)
        .catch((err: any) => console.error(err));

    const allStories = await Promise.all(
        allStoriesWithoutContent.map(
            async (story: any) => await getStory({ spaceId, storyId: story.id })
        )
    );

    return allStories;
};

export const getStory = ({
    spaceId,
    storyId,
}: {
    spaceId: number;
    storyId: number;
}) => {
    return sbApi
        .get(`spaces/${spaceId}/stories/${storyId}`)
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

// CREATE
export const createStory = ({
    spaceId,
    content,
}: {
    spaceId: number;
    content: any;
}) => {
    return sbApi
        .post(`spaces/${spaceId}/stories/`, {
            story: content,
            publish: 1,
        })
        .then((res: any) => res.data)
        .catch((err: any) => console.error(err));
};

export const updateStory = () => {};
