import type { AdaptiveLimiter } from "../../utils/rate-limiter.js";

import { delay } from "../../utils/async-utils.js";
import { CopyAbortedError } from "../../utils/rate-limiter.js";


const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_TRANSIENT_RETRIES = 3;

const resolveStatus = (error: any): number | undefined =>
    error?.status ?? error?.response?.status;

const resolveRetryAfterMs = (error: any): number | undefined => {
    const raw = error?.response?.headers?.["retry-after"];
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

const backoffMs = (attempt: number): number =>
    1000 * 2 ** attempt + Math.floor(Math.random() * 250);

export const wrapSbApiWithLimiter = (
    sbApi: any,
    limiter: AdaptiveLimiter,
    options?: { sleep?: (ms: number) => Promise<void> },
): any => {
    const sleep = options?.sleep ?? delay;

    const call = async (method: string, args: any[]): Promise<any> => {
        let rateLimitRetries = 0;
        let transientRetries = 0;

        for (;;) {
            try {
                const result = await limiter.schedule(() =>
                    sbApi[method](...args),
                );
                limiter.reward();
                return result;
            } catch (error: any) {
                if (error instanceof CopyAbortedError) throw error;

                const status = resolveStatus(error);

                if (
                    status === 429 &&
                    rateLimitRetries < MAX_RATE_LIMIT_RETRIES
                ) {
                    rateLimitRetries += 1;
                    const retryAfterMs = resolveRetryAfterMs(error);
                    limiter.penalize(retryAfterMs);
                    await sleep(retryAfterMs ?? backoffMs(rateLimitRetries));
                    continue;
                }

                const isTransient =
                    status === undefined || (status >= 500 && status < 600);

                if (isTransient && transientRetries < MAX_TRANSIENT_RETRIES) {
                    transientRetries += 1;
                    await sleep(backoffMs(transientRetries));
                    continue;
                }

                throw error;
            }
        }
    };

    const wrapped: any = {};
    for (const method of ["get", "post", "put", "delete"]) {
        if (typeof sbApi[method] === "function") {
            wrapped[method] = (...args: any[]) => call(method, args);
        }
    }
    // Preserve everything else (e.g. internal fields other code reads).
    return new Proxy(wrapped, {
        get: (target, prop) =>
            prop in target ? target[prop as string] : (sbApi as any)[prop],
    });
};
