import { delay } from "./async-utils.js";

export class CopyAbortedError extends Error {
    constructor() {
        super("Copy run aborted.");
        this.name = "CopyAbortedError";
    }
}

export type AdaptiveLimiter = {
    schedule: <T>(fn: () => Promise<T>) => Promise<T>;
    penalize: (retryAfterMs?: number) => void;
    reward: () => void;
    currentRate: () => number;
    abort: () => void;
    aborted: () => boolean;
};

const REWARD_INTERVAL_MS = 3000;

export const createAdaptiveLimiter = (options?: {
    targetRatePerSecond?: number;
    minRatePerSecond?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}): AdaptiveLimiter => {
    const targetRate = Math.max(1, options?.targetRatePerSecond ?? 6);
    const minRate = Math.max(0.5, options?.minRatePerSecond ?? 1);
    const now = options?.now ?? (() => Date.now());
    const sleep = options?.sleep ?? delay;

    let rate = targetRate;
    let tokens = targetRate;
    let lastRefillAt = now();
    let lastRewardAt = 0;
    let pausedUntil = 0;
    let inFlight = 0;
    let isAborted = false;

    const maxInFlight = () => Math.max(2, Math.ceil(rate * 2));

    const refill = () => {
        const elapsed = now() - lastRefillAt;
        if (elapsed <= 0) return;
        tokens = Math.min(rate, tokens + (elapsed / 1000) * rate);
        lastRefillAt = now();
    };

    const schedule = async <T>(fn: () => Promise<T>): Promise<T> => {
        for (;;) {
            if (isAborted) throw new CopyAbortedError();
            refill();
            const pauseLeft = pausedUntil - now();
            if (pauseLeft > 0) {
                await sleep(pauseLeft);
                continue;
            }
            if (tokens >= 1 && inFlight < maxInFlight()) break;
            await sleep(Math.max(50, 1000 / rate));
        }
        tokens -= 1;
        inFlight += 1;
        try {
            return await fn();
        } finally {
            inFlight -= 1;
        }
    };

    return {
        schedule,
        penalize: (retryAfterMs?: number) => {
            rate = Math.max(minRate, rate / 2);
            tokens = Math.min(tokens, rate);
            if (retryAfterMs && retryAfterMs > 0) {
                pausedUntil = Math.max(pausedUntil, now() + retryAfterMs);
            }
        },
        reward: () => {
            if (now() - lastRewardAt < REWARD_INTERVAL_MS) return;
            lastRewardAt = now();
            rate = Math.min(targetRate, rate * 1.1);
        },
        currentRate: () => rate,
        abort: () => {
            isAborted = true;
        },
        aborted: () => isAborted,
    };
};
