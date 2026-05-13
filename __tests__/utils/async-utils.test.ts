import { describe, it, expect, vi } from "vitest";

import { delay, mapWithConcurrency } from "../../src/utils/async-utils.js";

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

describe("mapWithConcurrency", () => {
    it("preserves result order while limiting concurrent work", async () => {
        let active = 0;
        let maxActive = 0;

        const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (
            item,
        ) => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active--;
            return item * 2;
        });

        expect(result).toEqual([2, 4, 6, 8, 10]);
        expect(maxActive).toBeLessThanOrEqual(2);
    });

    it("handles empty input", async () => {
        await expect(
            mapWithConcurrency([], 2, async (item) => item),
        ).resolves.toEqual([]);
    });
});
