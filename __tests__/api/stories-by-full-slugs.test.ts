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

import { getStoriesByFullSlugs } from "../../src/api/stories/stories.js";
import Logger from "../../src/utils/logger.js";

/** What storyblok-js-client rejects a GET with when the connection drops. */
const clientWrappedDrop = () => ({
    message: Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(
            new Error("connect ECONNREFUSED 127.0.0.1:59999"),
            { code: "ECONNREFUSED" },
        ),
    }),
});

const configWith = (get: (...args: any[]) => any) =>
    ({ spaceId: "12345", sbApi: { get: vi.fn(get) } }) as any;

describe("getStoriesByFullSlugs — a failed lookup is never 'none' (MAR-3411 R3)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the stories at those paths", async () => {
        const config = configWith(async () => ({
            data: { stories: [{ id: 1, full_slug: "about/" }] },
        }));

        await expect(
            getStoriesByFullSlugs(["about/"], config),
        ).resolves.toEqual([{ id: 1, full_slug: "about/" }]);
        expect(config.sbApi.get).toHaveBeenCalledWith("spaces/12345/stories/", {
            per_page: 100,
            by_slugs: "about/",
        });
    });

    it("returns [] when nothing is at those paths", async () => {
        const config = configWith(async () => ({ data: { stories: [] } }));

        await expect(getStoriesByFullSlugs(["nope/"], config)).resolves.toEqual(
            [],
        );
    });

    it("retries the client's wrapped network error once and returns the stories", async () => {
        let calls = 0;
        const config = configWith(async () => {
            calls += 1;

            if (calls === 1) {
                throw clientWrappedDrop();
            }

            return { data: { stories: [{ id: 1 }] } };
        });

        await expect(
            getStoriesByFullSlugs(["about/"], config),
        ).resolves.toEqual([{ id: 1 }]);
        expect(
            (
                Logger.warning as unknown as ReturnType<typeof vi.fn>
            ).mock.calls.map((call) => String(call[0])),
        ).toEqual([
            "retrying look up stories by full_slug for 'space 12345' (1/2) after connect ECONNREFUSED 127.0.0.1:59999",
        ]);
    });

    // R3 canary. Mutation that must turn it red: restore `return []` in the
    // catch.
    it("rejects, naming the lookup, when the network drop outlasts the retries", async () => {
        const config = configWith(async () => {
            throw clientWrappedDrop();
        });

        await expect(getStoriesByFullSlugs(["about/"], config)).rejects.toThrow(
            "Could not look up stories by full_slug (about/) in space '12345': connect ECONNREFUSED 127.0.0.1:59999 (after 3 attempts).",
        );
        expect(config.sbApi.get).toHaveBeenCalledTimes(3);
    });

    it("rejects a refusal at once, without retrying it", async () => {
        const config = configWith(async () => {
            throw {
                message: "Forbidden",
                status: 403,
                response: { status: 403 },
            };
        });

        await expect(getStoriesByFullSlugs(["about/"], config)).rejects.toThrow(
            "Could not look up stories by full_slug (about/) in space '12345': status 403.",
        );
        expect(config.sbApi.get).toHaveBeenCalledTimes(1);
    });

    it("answers a 404 as nothing found", async () => {
        const config = configWith(async () => {
            throw {
                message: "Not Found",
                status: 404,
                response: { status: 404 },
            };
        });

        await expect(
            getStoriesByFullSlugs(["about/"], config),
        ).resolves.toEqual([]);
    });
});
