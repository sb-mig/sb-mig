import { describe, it, expect } from "vitest";

import {
    createAdaptiveLimiter,
    CopyAbortedError,
} from "../../src/utils/rate-limiter.js";

const makeClock = () => {
    let time = 0;
    const pending: Array<{ at: number; resolve: () => void }> = [];
    return {
        now: () => time,
        sleep: (ms: number) =>
            new Promise<void>((resolve) => {
                pending.push({ at: time + ms, resolve });
            }),
        advance: async (ms: number) => {
            time += ms;
            for (const p of [...pending]) {
                if (p.at <= time) {
                    pending.splice(pending.indexOf(p), 1);
                    p.resolve();
                }
            }
            await Promise.resolve();
            await Promise.resolve();
        },
    };
};

describe("createAdaptiveLimiter", () => {
    it("runs at most rate*2 calls concurrently", async () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 2,
            now: clock.now,
            sleep: clock.sleep,
        });
        let inFlight = 0;
        let maxInFlight = 0;
        const resolvers: Array<() => void> = [];
        const task = () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise<void>((resolve) => {
                resolvers.push(() => {
                    inFlight--;
                    resolve();
                });
            });
        };
        const all = Promise.allSettled(
            Array.from({ length: 10 }, () => limiter.schedule(task)),
        );
        // burn enough virtual time for tokens to refill
        for (let index = 0; index < 20; index++) {
            await clock.advance(1000);
            resolvers.splice(0).forEach((resolve) => resolve());
        }
        await all;
        expect(maxInFlight).toBeLessThanOrEqual(4);
    });

    it("halves rate on penalize and ramps back on reward", async () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 6,
            now: clock.now,
            sleep: clock.sleep,
        });
        limiter.penalize();
        expect(limiter.currentRate()).toBe(3);
        limiter.penalize();
        expect(limiter.currentRate()).toBe(1.5);
        await clock.advance(3001);
        limiter.reward();
        expect(limiter.currentRate()).toBeCloseTo(1.65);
        // reward is throttled: immediate second reward is a no-op
        limiter.reward();
        expect(limiter.currentRate()).toBeCloseTo(1.65);
    });

    it("never drops below minRatePerSecond or above target", () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 6,
            minRatePerSecond: 2,
            now: clock.now,
            sleep: clock.sleep,
        });
        for (let index = 0; index < 10; index++) limiter.penalize();
        expect(limiter.currentRate()).toBe(2);
    });

    it("rejects new work after abort", async () => {
        const limiter = createAdaptiveLimiter({ targetRatePerSecond: 6 });
        limiter.abort();
        await expect(
            limiter.schedule(async () => "x"),
        ).rejects.toBeInstanceOf(CopyAbortedError);
    });
});
