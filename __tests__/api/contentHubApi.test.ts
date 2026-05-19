import { afterEach, describe, expect, it, vi } from "vitest";

import { contentHubApi } from "../../src/api/contentHubApi.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("contentHubApi", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches stories with encoded query params and auth header", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue({
                ok: true,
                json: async () => ({ stories: [] }),
            } as Response);

        await contentHubApi.getAllStories(
            {
                spaceId: "12345",
                storiesFilename: "folder/story name & draft?.json",
            },
            {
                contentHubOriginUrl: "https://content-hub.example.com/api/hub/",
                contentHubAuthorizationToken: "token",
                spaceId: "12345",
                sbApi: {} as any,
            },
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://content-hub.example.com/api/hub/getStories?spaceId=12345&storiesFilename=folder%2Fstory+name+%26+draft%3F.json",
            {
                method: "GET",
                headers: {
                    Authorization: "token",
                },
            },
        );
    });

    it("does not serialize missing storiesFilename as undefined", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue({
                ok: true,
                json: async () => ({ stories: [] }),
            } as Response);

        await contentHubApi.getAllStories(
            {
                spaceId: "12345",
            },
            {
                contentHubOriginUrl: "https://content-hub.example.com/api/hub",
                contentHubAuthorizationToken: "token",
                spaceId: "12345",
                sbApi: {} as any,
            },
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://content-hub.example.com/api/hub/getStories?spaceId=12345",
            expect.any(Object),
        );
    });
});
