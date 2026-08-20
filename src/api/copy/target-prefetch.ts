import { getAllItemsWithPagination } from "../utils/request.js";

export const prefetchTargetStories = async ({
    destination,
    config,
}: {
    destination: string;
    config: { spaceId: string; sbApi: any };
}): Promise<Map<string, any>> => {
    const { spaceId, sbApi } = config;
    const baseParams = destination ? { starts_with: destination } : {};

    const stories = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }: { per_page: number; page: number }) =>
            sbApi.get(`spaces/${spaceId}/stories/`, {
                ...baseParams,
                per_page,
                page,
            }),
        params: { spaceId },
        itemsKey: "stories",
    });

    return new Map(
        stories.map((story: any) => [String(story.full_slug), story] as const),
    );
};
