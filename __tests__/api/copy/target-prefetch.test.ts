import { describe, it, expect, vi } from "vitest";

import { prefetchTargetStories } from "../../../src/api/copy/target-prefetch.js";

const makeSbApi = (pages: any[][], total: number) => ({
    get: vi.fn().mockImplementation((_path: string, params: any) =>
        Promise.resolve({
            data: { stories: pages[(params.page ?? 1) - 1] ?? [] },
            total,
            perPage: params.per_page,
        }),
    ),
});

describe("prefetchTargetStories", () => {
    it("pages through the target list and maps by full_slug", async () => {
        const pageOne = Array.from({ length: 100 }, (_, index) => ({
            id: index,
            full_slug: `dest/story-${index}`,
        }));
        const pageTwo = [{ id: 100, full_slug: "dest/story-100" }];
        const sbApi = makeSbApi([pageOne, pageTwo], 101);
        const map = await prefetchTargetStories({
            destination: "dest",
            config: { spaceId: "2", sbApi },
        });
        expect(map.size).toBe(101);
        expect(map.get("dest/story-100")?.id).toBe(100);
        expect(sbApi.get).toHaveBeenCalledWith(
            "spaces/2/stories/",
            expect.objectContaining({ starts_with: "dest", page: 1 }),
        );
    });

    it("omits starts_with for the space root", async () => {
        const sbApi = makeSbApi([[]], 0);
        await prefetchTargetStories({
            destination: "",
            config: { spaceId: "2", sbApi },
        });
        const params = sbApi.get.mock.calls[0][1];
        expect("starts_with" in params).toBe(false);
    });
});
