import { describe, it, expect, vi } from "vitest";

import { wrapSbApiWithLimiter } from "../../../src/api/copy/limited-client.js";
import { createAdaptiveLimiter } from "../../../src/utils/rate-limiter.js";

const instantSleep = () => Promise.resolve();

const makeLimiter = () =>
    createAdaptiveLimiter({ targetRatePerSecond: 1000, sleep: instantSleep });

const httpError = (status: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`http ${status}`), {
        status,
        response: { status, headers },
    });

describe("wrapSbApiWithLimiter", () => {
    it("passes through successful calls and rewards the limiter", async () => {
        const limiter = makeLimiter();
        const reward = vi.spyOn(limiter, "reward");
        const sbApi = { get: vi.fn().mockResolvedValue({ data: { ok: 1 } }) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        const result = await wrapped.get("spaces/1/stories/", { page: 1 });
        expect(result).toEqual({ data: { ok: 1 } });
        expect(sbApi.get).toHaveBeenCalledWith("spaces/1/stories/", { page: 1 });
        expect(reward).toHaveBeenCalled();
    });

    it("retries a 429 up to 5 times, penalizes, honors retry-after", async () => {
        const limiter = makeLimiter();
        const penalize = vi.spyOn(limiter, "penalize");
        const sbApi = {
            put: vi
                .fn()
                .mockRejectedValueOnce(httpError(429, { "retry-after": "2" }))
                .mockRejectedValueOnce(httpError(429))
                .mockResolvedValue({ data: { done: true } }),
        };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        const result = await wrapped.put("spaces/1/stories/5", {});
        expect(result).toEqual({ data: { done: true } });
        expect(sbApi.put).toHaveBeenCalledTimes(3);
        expect(penalize).toHaveBeenNthCalledWith(1, 2000);
    });

    it("gives up after 5 429 retries", async () => {
        const limiter = makeLimiter();
        const sbApi = { post: vi.fn().mockRejectedValue(httpError(429)) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.post("x", {})).rejects.toMatchObject({
            status: 429,
        });
        expect(sbApi.post).toHaveBeenCalledTimes(6); // 1 + 5 retries
    });

    it("retries 5xx and network errors up to 3 times", async () => {
        const limiter = makeLimiter();
        const sbApi = {
            get: vi
                .fn()
                .mockRejectedValueOnce(httpError(503))
                .mockRejectedValueOnce(new Error("socket hang up"))
                .mockResolvedValue({ data: {} }),
        };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.get("x")).resolves.toEqual({ data: {} });
        expect(sbApi.get).toHaveBeenCalledTimes(3);
    });

    it("does not retry 4xx other than 429", async () => {
        const limiter = makeLimiter();
        const sbApi = { put: vi.fn().mockRejectedValue(httpError(422)) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.put("x", {})).rejects.toMatchObject({
            status: 422,
        });
        expect(sbApi.put).toHaveBeenCalledTimes(1);
    });
});
