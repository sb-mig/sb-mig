import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/async-utils.js", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    delay: async () => {},
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    getAllStories,
    getStoryById,
    getStoryBySlug,
} from "../../src/api/stories/stories.js";
import Logger from "../../src/utils/logger.js";

const warnings = () =>
    (Logger.warning as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => String(call[0]),
    );

const fetchFailed = () => ({ message: "fetch failed" });
const status = (code: number) =>
    Object.assign(new Error(`status ${code}`), {
        status: code,
        response: { status: code },
    });

const configWith = (get: (...args: any[]) => any) =>
    ({ spaceId: "12345", sbApi: { get: vi.fn(get) } }) as any;

describe("getStoryById — only a 404 means missing (MAR-3405 R1)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("answers a 404 with undefined", async () => {
        const config = configWith(async () => {
            throw status(404);
        });

        await expect(getStoryById("7", config)).resolves.toBeUndefined();
        expect(config.sbApi.get).toHaveBeenCalledTimes(1);
    });

    it("retries a dropped connection and returns the story, with one retry line per retry", async () => {
        let calls = 0;
        const config = configWith(async () => {
            calls += 1;

            if (calls <= 2) {
                throw fetchFailed();
            }

            return { data: { story: { id: 7 } } };
        });

        await expect(getStoryById("7", config)).resolves.toEqual({
            story: { id: 7 },
        });
        expect(warnings()).toEqual([
            "retrying read story 7 for 'space 12345' (1/2) after fetch failed",
            "retrying read story 7 for 'space 12345' (2/2) after fetch failed",
        ]);
    });

    // R1 canary. Mutation that must turn it red: return undefined on any
    // error again.
    it("rejects, naming the story and space, when a 500 outlasts the retries", async () => {
        const config = configWith(async () => {
            throw status(500);
        });

        await expect(getStoryById("7", config)).rejects.toThrow(
            "Failed to fetch story '7' with full content from space '12345' (status 500). Response: status 500 (after 3 attempts)",
        );
        expect(config.sbApi.get).toHaveBeenCalledTimes(3);
    });

    it("rejects a network error that outlasts the retries, never with a TypeError", async () => {
        const config = configWith(async () => {
            throw fetchFailed();
        });
        const call = getStoryById("7", config);

        await expect(call).rejects.toThrow(
            "Failed to fetch story '7' with full content from space '12345' (fetch failed). Response: fetch failed (after 3 attempts)",
        );
        await expect(call).rejects.not.toBeInstanceOf(TypeError);
    });

    // The shape storyblok-js-client really rejects with on a dropped
    // connection (measured against a refused port).
    it("retries the client's wrapped network error and names its socket code", async () => {
        let calls = 0;
        const config = configWith(async () => {
            calls += 1;

            if (calls === 1) {
                throw {
                    message: Object.assign(new TypeError("fetch failed"), {
                        cause: {
                            code: "ECONNRESET",
                            message: "read ECONNRESET",
                        },
                    }),
                };
            }

            return { data: { story: { id: 7 } } };
        });

        await expect(getStoryById("7", config)).resolves.toEqual({
            story: { id: 7 },
        });
        expect(warnings()).toEqual([
            "retrying read story 7 for 'space 12345' (1/2) after read ECONNRESET",
        ]);
    });

    it("rejects a final refusal at once, without retrying it", async () => {
        const config = configWith(async () => {
            throw status(401);
        });

        await expect(getStoryById("7", config)).rejects.toThrow(
            "Failed to fetch story '7' with full content from space '12345' (status 401).",
        );
        expect(config.sbApi.get).toHaveBeenCalledTimes(1);
    });
});

describe("getAllStories — a listing never drops a story (MAR-3405 R2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const listing = {
        data: {
            stories: [
                { id: 1, full_slug: "a" },
                { id: 2, full_slug: "b" },
                { id: 3, full_slug: "c" },
            ],
        },
        total: 3,
        perPage: 100,
    };

    // R2 canary. Mutation that must turn it red: filter out the reads that
    // failed and hand on the rest.
    it("rejects when one listed story cannot be read, instead of returning two", async () => {
        const config = configWith(async (url: string) => {
            if (url.endsWith("/stories/")) {
                return listing;
            }

            if (url.endsWith("/stories/2")) {
                throw fetchFailed();
            }

            return { data: { story: { id: Number(url.split("/").at(-1)) } } };
        });

        await expect(getAllStories({ quiet: true }, config)).rejects.toThrow(
            "Failed to fetch story '2'",
        );
    });

    it("leaves out a story that is gone (404) by the time it is read, and says so", async () => {
        const config = configWith(async (url: string) => {
            if (url.endsWith("/stories/")) {
                return listing;
            }

            if (url.endsWith("/stories/2")) {
                throw status(404);
            }

            return { data: { story: { id: Number(url.split("/").at(-1)) } } };
        });

        const result = await getAllStories({ quiet: true }, config);

        expect(result).toEqual([{ story: { id: 1 } }, { story: { id: 3 } }]);
        expect(result.includes(undefined)).toBe(false);
        expect(warnings()).toContain(
            "1 listed story/stories no longer exist in space '12345' (404 when read): b. They are left out.",
        );
    });
});

describe("getStoryBySlug — no crash (MAR-3405 R3)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects with the listing's cause instead of a TypeError", async () => {
        const config = configWith(async () => {
            throw status(403);
        });
        const call = getStoryBySlug("blog/post", config);

        await expect(call).rejects.toThrow("status 403");
        await expect(call).rejects.not.toBeInstanceOf(TypeError);
    });

    it("returns undefined when no story has that slug", async () => {
        const config = configWith(async () => ({ data: { stories: [] } }));

        await expect(
            getStoryBySlug("blog/none", config),
        ).resolves.toBeUndefined();
    });
});
