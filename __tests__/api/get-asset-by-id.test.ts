import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { getAssetById } from "../../src/api/assets/assets.js";

const answering = (outcome: () => Promise<any>) =>
    ({ spaceId: "12345", sbApi: { get: vi.fn(outcome) } }) as any;

/**
 * MAR-3404 R3: a network error has no `response`; it must neither crash the
 * catch nor be answered for. A 404 is "no such asset"; anything else rejects.
 */
describe("getAssetById — no crash, no lie (MAR-3404 R3)", () => {
    it("returns the asset it reads", async () => {
        await expect(
            getAssetById(
                { spaceId: "12345", assetId: 7 },
                answering(async () => ({ data: { id: 7, filename: "f" } })),
            ),
        ).resolves.toEqual({ id: 7, filename: "f" });
    });

    it("answers a 404 with undefined", async () => {
        await expect(
            getAssetById(
                { spaceId: "12345", assetId: 7 },
                answering(async () => {
                    throw Object.assign(new Error("Not Found"), {
                        status: 404,
                        response: { status: 404 },
                    });
                }),
            ),
        ).resolves.toBeUndefined();
    });

    // Mutation that must turn this red: read `err.response.status` again —
    // the catch then throws a TypeError instead of the network error.
    it("rethrows a network error without a response, never a TypeError", async () => {
        const call = getAssetById(
            { spaceId: "12345", assetId: 7 },
            answering(async () => {
                throw { message: "fetch failed" };
            }),
        );

        await expect(call).rejects.toEqual({ message: "fetch failed" });
        await expect(call).rejects.not.toBeInstanceOf(TypeError);
    });

    it("rethrows any other failure instead of answering false", async () => {
        await expect(
            getAssetById(
                { spaceId: "12345", assetId: 7 },
                answering(async () => {
                    throw Object.assign(new Error("Internal"), {
                        status: 500,
                        response: { status: 500 },
                    });
                }),
            ),
        ).rejects.toThrow("Internal");
    });
});
