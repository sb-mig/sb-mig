import { describe, it, expect, vi } from "vitest";

import { delay } from "../../src/utils/async-utils.js";

describe("delay - async delay utility", () => {
    it("should delay execution for specified time", async () => {
        vi.useFakeTimers();

        const start = Date.now();
        const delayPromise = delay(1000);

        // Fast-forward time
        vi.advanceTimersByTime(1000);

        await delayPromise;

        vi.useRealTimers();
    });

    it("should return a Promise", () => {
        const result = delay(100);

        expect(result).toBeInstanceOf(Promise);
    });

    it("should resolve with undefined", async () => {
        vi.useFakeTimers();

        const delayPromise = delay(50);
        vi.advanceTimersByTime(50);

        const result = await delayPromise;

        expect(result).toBeUndefined();

        vi.useRealTimers();
    });

    it("should work with 0 delay", async () => {
        vi.useFakeTimers();

        const delayPromise = delay(0);
        vi.advanceTimersByTime(0);

        await delayPromise;

        vi.useRealTimers();
    });
});


