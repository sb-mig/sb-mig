import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
    loggerMock: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: loggerMock,
}));

import { updateStory } from "../../src/api/stories/stories.js";

describe("updateStory", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("saves story updates as drafts by default", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        await updateStory(content, "story-1", { publish: false }, config);

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: content,
                publish: 0,
                force_update: 0,
            },
        );
    });

    it("publishes story updates when requested", async () => {
        const put = vi.fn().mockResolvedValue({
            data: {
                story: {
                    id: "story-1",
                    name: "Japan",
                    full_slug: "tours/destinations/japan",
                },
            },
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        await updateStory(content, "story-1", { publish: true }, config);

        expect(put).toHaveBeenCalledWith(
            "spaces/291967263583956/stories/story-1",
            {
                story: content,
                publish: 1,
                force_update: 0,
            },
        );
    });

    it("logs the failing story slug, space, and Storyblok response", async () => {
        const put = vi.fn().mockRejectedValue({
            status: 422,
            response: "The field sb-tab-item.content can't be blank",
        });
        const config = {
            spaceId: "291967263583956",
            sbApi: {
                put,
            },
        } as any;
        const content = {
            id: "story-1",
            name: "Japan",
            full_slug: "tours/destinations/japan",
        };

        const result = await updateStory(
            content,
            "story-1",
            { publish: false },
            config,
        );

        expect(put).toHaveBeenCalledOnce();
        expect(loggerMock.error).toHaveBeenCalledWith(
            "Failed to update story 'tours/destinations/japan' in space '291967263583956' (status 422). Response: The field sb-tab-item.content can't be blank",
        );
        expect(result).toMatchObject({
            ok: false,
            id: "story-1",
            name: "Japan",
            slug: "tours/destinations/japan",
            spaceId: "291967263583956",
            status: 422,
            response: "The field sb-tab-item.content can't be blank",
        });
    });
});
